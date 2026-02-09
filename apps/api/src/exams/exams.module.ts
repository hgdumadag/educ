import { Module } from "@nestjs/common";

import { SubjectsModule } from "../subjects/subjects.module.js";
import { ExamsController } from "./exams.controller.js";
import { ExamsService } from "./exams.service.js";

@Module({
  imports: [SubjectsModule],
  controllers: [ExamsController],
  providers: [ExamsService],
})
export class ExamsModule {}
