import {
  Body,
  BadRequestException,
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
import { env } from "../env.js";
import { LessonsService } from "./lessons.service.js";

const ZIP_CONTENT_TYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
]);

@Controller("lessons")
@UseGuards(JwtAuthGuard, RolesGuard)
export class LessonsController {
  constructor(@Inject(LessonsService) private readonly lessonsService: LessonsService) {}

  @Post("upload")
  @Roles(RoleKey.school_admin, RoleKey.teacher, RoleKey.parent, RoleKey.tutor)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: env.uploadMaxLessonZipBytes },
      fileFilter: (_req, file, callback) => {
        const isZipName = file.originalname.toLowerCase().endsWith(".zip");
        const isZipType = !file.mimetype || ZIP_CONTENT_TYPES.has(file.mimetype.toLowerCase());
        if (!isZipName || !isZipType) {
          callback(new BadRequestException("Only ZIP lesson files are accepted"), false);
          return;
        }

        callback(null, true);
      },
    }),
  )
  async upload(
    @CurrentUser() actor: AuthenticatedUser,
    @Body("subjectId") subjectId: string,
    @UploadedFile() file?: UploadedFileType,
  ) {
    return this.lessonsService.uploadLesson(actor, subjectId, file);
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
  @Roles(RoleKey.school_admin, RoleKey.teacher, RoleKey.parent, RoleKey.tutor)
  async remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("lessonId") lessonId: string,
  ) {
    return this.lessonsService.softDelete(actor, lessonId);
  }
}
