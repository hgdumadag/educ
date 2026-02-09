import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import type { RoleKey } from "@prisma/client";

import { env } from "../env.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RedisService } from "../redis/redis.service.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/tokens.js";
import type { LoginDto } from "./dto/login.dto.js";

interface AuthUserPayload {
  id: string;
  role: RoleKey;
  displayRole: string;
}

interface AuthSessionResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUserPayload;
}

const DEFAULT_ROLE_LABELS: Record<RoleKey, string> = {
  admin: "Admin",
  teacher: "Teacher",
  student: "Student",
};

const PERMISSIONS: Record<RoleKey, string[]> = {
  admin: [
    "users:create",
    "users:update",
    "labels:update",
    "reports:read",
    "audit:read",
    "subjects:manage:any",
  ],
  teacher: [
    "subjects:manage:own",
    "lessons:upload",
    "exams:upload",
    "assignments:create",
    "results:read",
    "reports:export",
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

  async login(dto: LoginDto, ipAddress: string): Promise<AuthSessionResult> {
    const identifier = dto.identifier.toLowerCase().trim();
    await this.assertLoginAllowed(identifier, ipAddress);

    const user = await this.prisma.user.findUnique({
      where: { email: identifier },
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

    const accessToken = signAccessToken(
      { sub: user.id, role: user.role },
      env.jwtAccessSecret,
    );
    const refreshToken = signRefreshToken(
      { sub: user.id, role: user.role },
      env.jwtRefreshSecret,
    );

    const refreshTokenHash = await hashPassword(refreshToken);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        role: user.role,
        displayRole: await this.getDisplayLabel(user.role),
      },
    };
  }

  async refresh(refreshToken: string): Promise<AuthSessionResult> {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken, env.jwtRefreshSecret);
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive || !user.refreshTokenHash) {
      throw new UnauthorizedException("Refresh token rejected");
    }

    const isValid = await verifyPassword(refreshToken, user.refreshTokenHash);
    if (!isValid) {
      throw new UnauthorizedException("Refresh token rejected");
    }

    const accessToken = signAccessToken(
      { sub: user.id, role: user.role },
      env.jwtAccessSecret,
    );
    const newRefreshToken = signRefreshToken(
      { sub: user.id, role: user.role },
      env.jwtRefreshSecret,
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: await hashPassword(newRefreshToken) },
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        role: user.role,
        displayRole: await this.getDisplayLabel(user.role),
      },
    };
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

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      displayRole: await this.getDisplayLabel(user.role),
      permissions: PERMISSIONS[user.role],
    };
  }
}
