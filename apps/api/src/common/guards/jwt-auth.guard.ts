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

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      cookies?: Record<string, string | undefined>;
      user?: AuthenticatedUser;
    }>();

    const authHeader = request.headers.authorization;
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

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("User is inactive or missing");
    }

    request.user = {
      id: user.id,
      role: user.role,
      email: user.email,
    };

    return true;
  }
}
