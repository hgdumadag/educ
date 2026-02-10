import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { RoleKey } from "@prisma/client";
import { createHash } from "node:crypto";

import { env } from "../env.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RedisService } from "../redis/redis.service.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/tokens.js";
import type { LoginDto } from "./dto/login.dto.js";

interface AuthContextSummary {
  membershipId: string;
  tenantId: string;
  tenantName: string;
  tenantType: "institution" | "individual";
  role: RoleKey;
}

interface AuthUserPayload {
  id: string;
  email: string;
  role: RoleKey;
  permissions: string[];
  isPlatformAdmin: boolean;
  activeContext: AuthContextSummary;
  contexts: AuthContextSummary[];
  displayRole: string;
}

interface AuthSessionResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUserPayload;
}

const DEFAULT_ROLE_LABELS: Record<RoleKey, string> = {
  platform_admin: "Platform Admin",
  school_admin: "School Admin",
  teacher: "Teacher",
  student: "Student",
  parent: "Parent",
  tutor: "Tutor",
};

const PERMISSIONS: Record<RoleKey, string[]> = {
  platform_admin: [
    "platform:institutions:manage",
    "platform:billing:read",
    "tenants:memberships:manage:any",
  ],
  school_admin: [
    "tenants:memberships:manage",
    "subjects:manage:any",
    "lessons:upload",
    "exams:upload",
    "assignments:create",
    "reports:read",
    "audit:read",
  ],
  teacher: [
    "subjects:manage:own",
    "lessons:upload",
    "exams:upload",
    "assignments:create",
    "results:read",
  ],
  parent: [
    "subjects:manage:own",
    "lessons:upload",
    "exams:upload",
    "assignments:create",
    "results:read",
  ],
  tutor: [
    "subjects:manage:own",
    "lessons:upload",
    "exams:upload",
    "assignments:create",
    "results:read",
  ],
  student: ["assignments:read:own", "attempts:create", "attempts:submit", "results:read:own"],
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  private loginRateLimitPrefix(identifier: string, ipAddress: string): string {
    const digest = createHash("sha256")
      .update(`${identifier.trim().toLowerCase()}|${ipAddress}`)
      .digest("hex");
    return `auth:login:${digest}`;
  }

  private async runRateLimitOperation(operation: () => Promise<void>): Promise<void> {
    try {
      await operation();
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
        throw error;
      }

      if (env.isProduction) {
        throw new ServiceUnavailableException("Rate limit backend unavailable");
      }
    }
  }

  private async assertLoginAllowed(identifier: string, ipAddress: string): Promise<void> {
    await this.runRateLimitOperation(async () => {
      const blockTtl = await this.redis.ttl(`${this.loginRateLimitPrefix(identifier, ipAddress)}:blocked`);
      if (blockTtl > 0) {
        throw new HttpException(
          `Too many failed login attempts. Try again in ${blockTtl} seconds.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    });
  }

  private async registerFailedLogin(identifier: string, ipAddress: string): Promise<void> {
    await this.runRateLimitOperation(async () => {
      const keyPrefix = this.loginRateLimitPrefix(identifier, ipAddress);
      const attemptsKey = `${keyPrefix}:attempts`;
      const blockedKey = `${keyPrefix}:blocked`;

      const attempts = await this.redis.incr(attemptsKey);
      if (attempts === 1) {
        await this.redis.expire(attemptsKey, env.authFailedWindowSeconds);
      }

      if (attempts >= env.authMaxFailedLogins) {
        await this.redis.set(blockedKey, "1", env.authLockoutSeconds);
        await this.redis.del(attemptsKey);
      }
    });
  }

  private async clearLoginFailures(identifier: string, ipAddress: string): Promise<void> {
    await this.runRateLimitOperation(async () => {
      const keyPrefix = this.loginRateLimitPrefix(identifier, ipAddress);
      await this.redis.del(`${keyPrefix}:attempts`, `${keyPrefix}:blocked`);
    });
  }

  private async getDisplayLabel(role: RoleKey): Promise<string> {
    const roleLabel = await this.prisma.roleLabel.findUnique({ where: { roleKey: role } });
    return roleLabel?.displayLabel ?? DEFAULT_ROLE_LABELS[role];
  }

  private async listActiveMemberships(userId: string) {
    return this.prisma.membership.findMany({
      where: {
        userId,
        status: "active",
        tenant: {
          status: "active",
        },
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
      orderBy: [{ createdAt: "asc" }],
    });
  }

  private toContextSummary(membership: {
    id: string;
    tenantId: string;
    role: RoleKey;
    tenant: {
      id: string;
      name: string;
      type: "institution" | "individual";
    };
  }): AuthContextSummary {
    return {
      membershipId: membership.id,
      tenantId: membership.tenantId,
      tenantName: membership.tenant.name,
      tenantType: membership.tenant.type,
      role: membership.role,
    };
  }

  private pickActiveMembership(
    memberships: Array<{
      id: string;
      tenantId: string;
      role: RoleKey;
      tenant: { id: string; name: string; type: "institution" | "individual" };
    }>,
    preferredMembershipId?: string,
  ) {
    if (memberships.length === 0) {
      throw new UnauthorizedException("No active memberships available");
    }

    if (preferredMembershipId) {
      const matched = memberships.find((membership) => membership.id === preferredMembershipId);
      if (matched) {
        return matched;
      }
    }

    return memberships[0];
  }

  private getEffectiveRole(isPlatformAdmin: boolean, activeMembershipRole: RoleKey): RoleKey {
    return isPlatformAdmin ? RoleKey.platform_admin : activeMembershipRole;
  }

  private buildPermissions(isPlatformAdmin: boolean, activeMembershipRole: RoleKey): string[] {
    const activeRolePermissions = PERMISSIONS[activeMembershipRole] ?? [];
    if (isPlatformAdmin) {
      return [...new Set([...activeRolePermissions, ...PERMISSIONS.platform_admin])];
    }

    return activeRolePermissions;
  }

  private async createSession(
    user: { id: string; email: string; isPlatformAdmin: boolean },
    memberships: Array<{
      id: string;
      tenantId: string;
      role: RoleKey;
      tenant: { id: string; name: string; type: "institution" | "individual" };
    }>,
    preferredMembershipId?: string,
  ): Promise<AuthSessionResult> {
    const activeMembership = this.pickActiveMembership(memberships, preferredMembershipId);
    const effectiveRole = this.getEffectiveRole(user.isPlatformAdmin, activeMembership.role);
    const permissions = this.buildPermissions(user.isPlatformAdmin, activeMembership.role);

    const accessToken = signAccessToken(
      {
        sub: user.id,
        activeTenantId: activeMembership.tenantId,
        activeMembershipId: activeMembership.id,
        activeRole: activeMembership.role,
      },
      env.jwtAccessSecret,
    );

    const refreshToken = signRefreshToken(
      {
        sub: user.id,
        activeTenantId: activeMembership.tenantId,
        activeMembershipId: activeMembership.id,
        activeRole: activeMembership.role,
      },
      env.jwtRefreshSecret,
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: await hashPassword(refreshToken) },
    });

    const contexts = memberships.map((membership) => this.toContextSummary(membership));

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: effectiveRole,
        permissions,
        isPlatformAdmin: user.isPlatformAdmin,
        activeContext: this.toContextSummary(activeMembership),
        contexts,
        displayRole: await this.getDisplayLabel(effectiveRole),
      },
    };
  }

  async login(dto: LoginDto, ipAddress: string): Promise<AuthSessionResult> {
    const identifier = dto.identifier.toLowerCase().trim();
    await this.assertLoginAllowed(identifier, ipAddress);

    const user = await this.prisma.user.findUnique({
      where: { email: identifier },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        isActive: true,
        isPlatformAdmin: true,
      },
    });

    if (!user || !user.isActive) {
      await this.registerFailedLogin(identifier, ipAddress);
      throw new UnauthorizedException("Invalid credentials");
    }

    const passwordMatches = await verifyPassword(dto.password, user.passwordHash);
    if (!passwordMatches) {
      await this.registerFailedLogin(identifier, ipAddress);
      throw new UnauthorizedException("Invalid credentials");
    }

    await this.clearLoginFailures(identifier, ipAddress);

    const memberships = await this.listActiveMemberships(user.id);

    return this.createSession(
      {
        id: user.id,
        email: user.email,
        isPlatformAdmin: user.isPlatformAdmin,
      },
      memberships,
    );
  }

  async refresh(refreshToken: string): Promise<AuthSessionResult> {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken, env.jwtRefreshSecret);
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        refreshTokenHash: true,
        isActive: true,
        isPlatformAdmin: true,
      },
    });
    if (!user || !user.isActive || !user.refreshTokenHash) {
      throw new UnauthorizedException("Refresh token rejected");
    }

    const isValid = await verifyPassword(refreshToken, user.refreshTokenHash);
    if (!isValid) {
      throw new UnauthorizedException("Refresh token rejected");
    }

    const memberships = await this.listActiveMemberships(user.id);

    return this.createSession(
      {
        id: user.id,
        email: user.email,
        isPlatformAdmin: user.isPlatformAdmin,
      },
      memberships,
      payload.activeMembershipId,
    );
  }

  async switchContext(userId: string, membershipId: string): Promise<AuthSessionResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        isPlatformAdmin: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("User not found or inactive");
    }

    const memberships = await this.listActiveMemberships(user.id);
    const selected = memberships.find((membership) => membership.id === membershipId);

    if (!selected) {
      throw new UnauthorizedException("Membership is not available for this user");
    }

    return this.createSession(
      {
        id: user.id,
        email: user.email,
        isPlatformAdmin: user.isPlatformAdmin,
      },
      memberships,
      selected.id,
    );
  }

  async logout(args: { userId?: string; refreshToken?: string }): Promise<{ ok: true }> {
    if (args.userId) {
      await this.prisma.user.update({
        where: { id: args.userId },
        data: { refreshTokenHash: null },
      });
      return { ok: true };
    }

    if (args.refreshToken) {
      try {
        const payload = verifyRefreshToken(args.refreshToken, env.jwtRefreshSecret);
        await this.prisma.user.updateMany({
          where: { id: payload.sub },
          data: { refreshTokenHash: null },
        });
      } catch {
        // Ignore invalid token; logout should still clear cookies.
      }
    }

    return { ok: true };
  }

  async me(args: { userId: string; activeMembershipId?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: args.userId },
      select: {
        id: true,
        email: true,
        isPlatformAdmin: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    const memberships = await this.listActiveMemberships(user.id);
    const activeMembership = this.pickActiveMembership(memberships, args.activeMembershipId);
    const effectiveRole = this.getEffectiveRole(user.isPlatformAdmin, activeMembership.role);
    const permissions = this.buildPermissions(user.isPlatformAdmin, activeMembership.role);
    const activeContext = this.toContextSummary(activeMembership);

    return {
      id: user.id,
      email: user.email,
      role: effectiveRole,
      isPlatformAdmin: user.isPlatformAdmin,
      activeContext,
      contexts: memberships.map((membership) => this.toContextSummary(membership)),
      displayRole: await this.getDisplayLabel(effectiveRole),
      permissions,
    };
  }
}
