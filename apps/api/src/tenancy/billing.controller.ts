import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import type { AuthenticatedUser } from "../common/types/authenticated-user.type.js";
import { CreateBillingAccountDto } from "./dto/create-billing-account.dto.js";
import { CreateSubscriptionDto } from "./dto/create-subscription.dto.js";
import { TenancyService } from "./tenancy.service.js";

@Controller("billing")
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(@Inject(TenancyService) private readonly tenancyService: TenancyService) {}

  @Post("accounts")
  async createAccount(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateBillingAccountDto,
  ) {
    return this.tenancyService.createBillingAccount(actor, dto);
  }

  @Post("subscriptions")
  async createSubscription(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateSubscriptionDto,
  ) {
    return this.tenancyService.createSubscription(actor, dto);
  }

  @Get("accounts/:id")
  async getAccount(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") billingAccountId: string,
  ) {
    return this.tenancyService.getBillingAccount(actor, billingAccountId);
  }
}
