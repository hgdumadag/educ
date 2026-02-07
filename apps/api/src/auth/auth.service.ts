import {
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { RoleKey } from "@prisma/client";

import { env } from "../env.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/tokens.js";
import type { LoginDto } from "./dto/login.dto.js";
import type { RefreshDto } from "./dto/refresh.dto.js";

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
  ],
  teacher: [
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
  constructor(private readonly prisma: PrismaService) {}

  private async getDisplayLabel(role: RoleKey): Promise<string> {
    const roleLabel = await this.prisma.roleLabel.findUnique({ where: { roleKey: role } });
    return roleLabel?.displayLabel ?? DEFAULT_ROLE_LABELS[role];
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.identifier.toLowerCase().trim() },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const passwordMatches = await verifyPassword(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid credentials");
    }

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

  async refresh(dto: RefreshDto) {
    let payload;
    try {
      payload = verifyRefreshToken(dto.refreshToken, env.jwtRefreshSecret);
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive || !user.refreshTokenHash) {
      throw new UnauthorizedException("Refresh token rejected");
    }

    const isValid = await verifyPassword(dto.refreshToken, user.refreshTokenHash);
    if (!isValid) {
      throw new UnauthorizedException("Refresh token rejected");
    }

    const accessToken = signAccessToken(
      { sub: user.id, role: user.role },
      env.jwtAccessSecret,
    );
    const refreshToken = signRefreshToken(
      { sub: user.id, role: user.role },
      env.jwtRefreshSecret,
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: await hashPassword(refreshToken) },
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

  async logout(userId: string): Promise<{ ok: true }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });

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
