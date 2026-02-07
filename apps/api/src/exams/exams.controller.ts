import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
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
import { CreateAssignmentDto } from "./dto/create-assignment.dto.js";
import { CreateAttemptDto } from "./dto/create-attempt.dto.js";
import { SaveResponsesDto } from "./dto/save-responses.dto.js";
import { ExamsService } from "./exams.service.js";

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExamsController {
  constructor(@Inject(ExamsService) private readonly examsService: ExamsService) {}

  @Post("exams/upload")
  @Roles(RoleKey.teacher, RoleKey.admin)
  @UseInterceptors(FileInterceptor("file"))
  async uploadExam(
    @CurrentUser() actor: AuthenticatedUser,
    @UploadedFile() file?: UploadedFileType,
  ) {
    return this.examsService.uploadExam(actor, file);
  }

  @Get("exams")
  async listExams(@CurrentUser() actor: AuthenticatedUser) {
    return this.examsService.listExams(actor);
  }

  @Get("exams/:examId")
  async getExam(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("examId") examId: string,
  ) {
    return this.examsService.getExam(actor, examId);
  }

  @Post("assignments")
  @Roles(RoleKey.teacher, RoleKey.admin)
  async createAssignment(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.examsService.createAssignment(actor, dto);
  }

  @Get("assignments/my")
  @Roles(RoleKey.student)
  async myAssignments(@CurrentUser() actor: AuthenticatedUser) {
    return this.examsService.getMyAssignments(actor);
  }

  @Post("attempts")
  @Roles(RoleKey.student)
  async createAttempt(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateAttemptDto,
  ) {
    return this.examsService.createAttempt(actor, dto);
  }

  @Patch("attempts/:attemptId/responses")
  @Roles(RoleKey.student)
  async autosaveResponses(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("attemptId") attemptId: string,
    @Body() dto: SaveResponsesDto,
  ) {
    return this.examsService.saveResponses(actor, attemptId, dto);
  }

  @Post("attempts/:attemptId/submit")
  @Roles(RoleKey.student)
  async submitAttempt(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("attemptId") attemptId: string,
  ) {
    return this.examsService.submitAttempt(actor, attemptId);
  }

  @Get("attempts/:attemptId/result")
  async result(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("attemptId") attemptId: string,
  ) {
    return this.examsService.getAttemptResult(actor, attemptId);
  }
}
