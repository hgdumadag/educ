import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module.js";
import { LessonsModule } from "../lessons/lessons.module.js";
import { SubjectsModule } from "../subjects/subjects.module.js";
import { PlatformImportsController } from "./platform-imports.controller.js";
import { PlatformImportsService } from "./platform-imports.service.js";
import { TenantImportsController } from "./tenant-imports.controller.js";
import { TenantImportsService } from "./tenant-imports.service.js";

@Module({
  imports: [PrismaModule, SubjectsModule, LessonsModule],
  controllers: [TenantImportsController, PlatformImportsController],
  providers: [TenantImportsService, PlatformImportsService],
})
export class ImportsModule {}

