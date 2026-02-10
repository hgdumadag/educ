import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import type { AuthenticatedUser } from "../common/types/authenticated-user.type.js";
import {
  REFRESH_TOKEN_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from "./auth-cookies.js";
import { AuthService } from "./auth.service.js";
import { LoginDto } from "./dto/login.dto.js";
import { SwitchContextDto } from "./dto/switch-context.dto.js";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("login")
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.login(
      dto,
      req.ip ?? req.socket.remoteAddress ?? "unknown",
    );
    setAuthCookies(res, session.accessToken, session.refreshToken);

    return { user: session.user };
  }

  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!refreshToken) {
      throw new UnauthorizedException("Missing refresh token");
    }

    const session = await this.authService.refresh(refreshToken);
    setAuthCookies(res, session.accessToken, session.refreshToken);

    return { user: session.user };
  }

  @Post("switch-context")
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async switchContext(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SwitchContextDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.switchContext(user.id, dto.membershipId);
    setAuthCookies(res, session.accessToken, session.refreshToken);

    return { user: session.user };
  }

  @Post("logout")
  @HttpCode(200)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout({ refreshToken: req.cookies?.[REFRESH_TOKEN_COOKIE] });
    clearAuthCookies(res);

    return { ok: true };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me({
      userId: user.id,
      activeMembershipId: user.activeMembershipId,
    });
  }
}
