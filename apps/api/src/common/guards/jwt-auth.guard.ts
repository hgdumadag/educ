import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import { ACCESS_TOKEN_COOKIE } from "../../auth/auth-cookies.js";
import { env } from "../../env.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { verifyAccessToken } from "../../utils/tokens.js";
import type { AuthenticatedUser } from "../types/authenticated-user.type.js";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private readTenantOverride(headers: Record<string, string | string[] | undefined>): string | undefined {
    const raw = headers["x-tenant-id"];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) {
      return undefined;
    }

    const normalized = value.trim();
    return normalized ? normalized : undefined;
  }

  private readAuthorization(headers: Record<string, string | string[] | undefined>): string | undefined {
    const raw = headers.authorization;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) {
      return undefined;
    }

    const normalized = value.trim();
    return normalized ? normalized : undefined;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      cookies?: Record<string, string | undefined>;
      user?: AuthenticatedUser;
    }>();

    const authHeader = this.readAuthorization(request.headers);
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;
    const cookieToken = request.cookies?.[ACCESS_TOKEN_COOKIE];
    const token = bearerToken ?? cookieToken;

    if (!token) {
      throw new UnauthorizedException("Missing access token");
    }

    let payload;
    try {
      payload = verifyAccessToken(token, env.jwtAccessSecret);
    } catch {
      throw new UnauthorizedException("Invalid access token");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        isActive: true,
        isPlatformAdmin: true,
      },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("User is inactive or missing");
    }

    const membership = await this.prisma.membership.findFirst({
      where: {
        id: payload.activeMembershipId,
        userId: user.id,
        tenantId: payload.activeTenantId,
        role: payload.activeRole,
        status: "active",
        tenant: {
          status: "active",
        },
      },
      select: {
        id: true,
        tenantId: true,
        role: true,
      },
    });

    if (!membership) {
      throw new UnauthorizedException("Membership context is invalid");
    }

    let activeTenantId = membership.tenantId;
    if (user.isPlatformAdmin) {
      const tenantOverride = this.readTenantOverride(request.headers);
      if (tenantOverride) {
        const tenant = await this.prisma.tenant.findFirst({
          where: {
            id: tenantOverride,
            status: "active",
          },
          select: { id: true },
        });

        if (!tenant) {
          throw new UnauthorizedException("Tenant override is invalid");
        }

        activeTenantId = tenant.id;
      }
    }

    request.user = {
      id: user.id,
      email: user.email,
      activeTenantId,
      activeMembershipId: membership.id,
      activeRole: membership.role,
      isPlatformAdmin: user.isPlatformAdmin,
    };

    return true;
  }
}
