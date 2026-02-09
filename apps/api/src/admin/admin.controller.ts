import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  ParseIntPipe,
  UseGuards,
} from "@nestjs/common";
import { RoleKey } from "@prisma/client";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import { RolesGuard } from "../common/guards/roles.guard.js";
import type { AuthenticatedUser } from "../common/types/authenticated-user.type.js";
import { AdminService } from "./admin.service.js";
import { CreateUserDto } from "./dto/create-user.dto.js";
import { ResetPasswordDto } from "./dto/reset-password.dto.js";
import { UpdateRoleLabelDto } from "./dto/update-role-label.dto.js";
import { UpdateUserDto } from "./dto/update-user.dto.js";

@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleKey.admin)
export class AdminController {
  constructor(@Inject(AdminService) private readonly adminService: AdminService) {}

  @Post("users")
  async createUser(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateUserDto,
  ) {
    return this.adminService.createUser(actor, dto);
  }

  @Patch("users/:userId")
  async updateUser(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("userId") userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.adminService.updateUser(actor, userId, dto);
  }

  @Post("users/:userId/reset-password")
  async resetPassword(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("userId") userId: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.adminService.resetPassword(actor, userId, dto);
  }

  @Post("users/:userId/deactivate")
  async deactivateUser(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("userId") userId: string,
  ) {
    return this.adminService.deactivateUser(actor, userId);
  }

  @Get("role-labels")
  async roleLabels() {
    return this.adminService.getRoleLabels();
  }

  @Patch("role-labels/:roleKey")
  async updateRoleLabel(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("roleKey") roleKey: RoleKey,
    @Body() dto: UpdateRoleLabelDto,
  ) {
    return this.adminService.updateRoleLabel(actor, roleKey, dto);
  }

  @Get("reports/attempts")
  async attemptsReport(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("pageSize", new DefaultValuePipe(50), ParseIntPipe) pageSize: number,
  ) {
    return this.adminService.getAttemptsReport({ page, pageSize });
  }

  @Get("reports/export.csv")
  @Header("Content-Type", "text/csv")
  async exportCsv() {
    return this.adminService.exportAttemptsCsv();
  }

  @Get("audit-events")
  async auditEvents(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("pageSize", new DefaultValuePipe(50), ParseIntPipe) pageSize: number,
  ) {
    return this.adminService.getAuditEvents({ page, pageSize });
  }

  @Get("metrics")
  async metrics() {
    return this.adminService.getOperationalMetrics();
  }
}
