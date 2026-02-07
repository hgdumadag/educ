import { Module } from "@nestjs/common";

import { ExamsController } from "./exams.controller.js";
import { ExamsService } from "./exams.service.js";

@Module({
  controllers: [ExamsController],
  providers: [ExamsService],
})
export class ExamsModule {}
