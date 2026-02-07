import {
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { RoleKey } from "@prisma/client";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import { RolesGuard } from "../common/guards/roles.guard.js";
import type { AuthenticatedUser } from "../common/types/authenticated-user.type.js";
import type { UploadedFile as UploadedFileType } from "../common/types/upload-file.type.js";
import { LessonsService } from "./lessons.service.js";

@Controller("lessons")
@UseGuards(JwtAuthGuard, RolesGuard)
export class LessonsController {
  constructor(@Inject(LessonsService) private readonly lessonsService: LessonsService) {}

  @Post("upload")
  @Roles(RoleKey.teacher, RoleKey.admin)
  @UseInterceptors(FileInterceptor("file"))
  async upload(
    @CurrentUser() actor: AuthenticatedUser,
    @UploadedFile() file?: UploadedFileType,
  ) {
    return this.lessonsService.uploadLesson(actor, file);
  }

  @Get()
  async list(@CurrentUser() actor: AuthenticatedUser) {
    return this.lessonsService.listLessons(actor);
  }

  @Get(":lessonId")
  async get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("lessonId") lessonId: string,
  ) {
    return this.lessonsService.getLesson(actor, lessonId);
  }

  @Delete(":lessonId")
  @Roles(RoleKey.teacher, RoleKey.admin)
  async remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("lessonId") lessonId: string,
  ) {
    return this.lessonsService.softDelete(actor, lessonId);
  }
}
