import { Module } from "@nestjs/common";

import { BillingController } from "./billing.controller.js";
import { PlatformController } from "./platform.controller.js";
import { TenantMembershipsController } from "./tenant-memberships.controller.js";
import { TenancyService } from "./tenancy.service.js";

@Module({
  controllers: [PlatformController, TenantMembershipsController, BillingController],
  providers: [TenancyService],
  exports: [TenancyService],
})
export class TenancyModule {}
