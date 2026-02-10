import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import type { AuthenticatedUser } from "../common/types/authenticated-user.type.js";
import { CreateMembershipDto } from "./dto/create-membership.dto.js";
import { UpdateMembershipDto } from "./dto/update-membership.dto.js";
import { TenancyService } from "./tenancy.service.js";

@Controller("tenants/:tenantId/memberships")
@UseGuards(JwtAuthGuard)
export class TenantMembershipsController {
  constructor(@Inject(TenancyService) private readonly tenancyService: TenancyService) {}

  @Get()
  async list(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("tenantId") tenantId: string,
  ) {
    return this.tenancyService.listMemberships(actor, tenantId);
  }

  @Post()
  async create(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("tenantId") tenantId: string,
    @Body() dto: CreateMembershipDto,
  ) {
    return this.tenancyService.createMembership(actor, tenantId, dto);
  }

  @Patch(":membershipId")
  async update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("tenantId") tenantId: string,
    @Param("membershipId") membershipId: string,
    @Body() dto: UpdateMembershipDto,
  ) {
    return this.tenancyService.updateMembership(actor, tenantId, membershipId, dto);
  }
}
