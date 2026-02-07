import { Module } from "@nestjs/common";

import { LessonsController } from "./lessons.controller.js";
import { LessonsService } from "./lessons.service.js";

@Module({
  controllers: [LessonsController],
  providers: [LessonsService],
})
export class LessonsModule {}
