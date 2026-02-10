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
import { TenancyService } from "./tenancy.service.js";
import { AddInstitutionAdminDto } from "./dto/add-institution-admin.dto.js";
import { CreateInstitutionDto } from "./dto/create-institution.dto.js";
import { UpdateInstitutionDto } from "./dto/update-institution.dto.js";

@Controller("platform")
@UseGuards(JwtAuthGuard)
export class PlatformController {
  constructor(@Inject(TenancyService) private readonly tenancyService: TenancyService) {}

  @Post("institutions")
  async createInstitution(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateInstitutionDto,
  ) {
    return this.tenancyService.createInstitution(actor, dto);
  }

  @Get("institutions")
  async listInstitutions(@CurrentUser() actor: AuthenticatedUser) {
    return this.tenancyService.listInstitutions(actor);
  }

  @Patch("institutions/:id")
  async updateInstitution(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") tenantId: string,
    @Body() dto: UpdateInstitutionDto,
  ) {
    return this.tenancyService.updateInstitution(actor, tenantId, dto);
  }

  @Post("institutions/:id/admins")
  async addInstitutionAdmin(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") tenantId: string,
    @Body() dto: AddInstitutionAdminDto,
  ) {
    return this.tenancyService.addInstitutionAdmin(actor, tenantId, dto);
  }
}
