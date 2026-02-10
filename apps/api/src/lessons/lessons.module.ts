import { Module } from "@nestjs/common";

import { SubjectsModule } from "../subjects/subjects.module.js";
import { LessonsController } from "./lessons.controller.js";
import { LessonsService } from "./lessons.service.js";

@Module({
  imports: [SubjectsModule],
  controllers: [LessonsController],
  providers: [LessonsService],
  exports: [LessonsService],
})
export class LessonsModule {}
