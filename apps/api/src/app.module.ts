import { Module } from "@nestjs/common";

import { AdminModule } from "./admin/admin.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { ExamsModule } from "./exams/exams.module.js";
import { ImportsModule } from "./imports/imports.module.js";
import { LessonsModule } from "./lessons/lessons.module.js";
import { ObservabilityModule } from "./observability/observability.module.js";
import { OpenAiModule } from "./openai/openai.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { RedisModule } from "./redis/redis.module.js";
import { SubjectsModule } from "./subjects/subjects.module.js";
import { TenancyModule } from "./tenancy/tenancy.module.js";

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    ObservabilityModule,
    OpenAiModule,
    AuthModule,
    TenancyModule,
    ImportsModule,
    AdminModule,
    SubjectsModule,
    LessonsModule,
    ExamsModule,
  ],
})
export class AppModule {}
