import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { RoleKey } from "@prisma/client";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import { RolesGuard } from "../common/guards/roles.guard.js";
import type { AuthenticatedUser } from "../common/types/authenticated-user.type.js";
import { CreateSubjectDto } from "./dto/create-subject.dto.js";
import { EnrollSubjectStudentDto } from "./dto/enroll-subject-student.dto.js";
import { ListSubjectsQueryDto } from "./dto/list-subjects-query.dto.js";
import { UpdateSubjectEnrollmentDto } from "./dto/update-subject-enrollment.dto.js";
import { UpdateSubjectDto } from "./dto/update-subject.dto.js";
import { SubjectsService } from "./subjects.service.js";

@Controller("subjects")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleKey.school_admin, RoleKey.teacher, RoleKey.parent, RoleKey.tutor)
export class SubjectsController {
  constructor(@Inject(SubjectsService) private readonly subjectsService: SubjectsService) {}

  @Post()
  async createSubject(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateSubjectDto,
  ) {
    return this.subjectsService.createSubject(actor, dto);
  }

  @Get()
  async listSubjects(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListSubjectsQueryDto,
  ) {
    return this.subjectsService.listSubjects(actor, query);
  }

  @Patch(":subjectId")
  async updateSubject(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("subjectId") subjectId: string,
    @Body() dto: UpdateSubjectDto,
  ) {
    return this.subjectsService.updateSubject(actor, subjectId, dto);
  }

  @Get(":subjectId/students")
  async listSubjectStudents(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("subjectId") subjectId: string,
  ) {
    return this.subjectsService.listSubjectStudents(actor, subjectId);
  }

  @Post(":subjectId/students")
  async enrollSubjectStudent(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("subjectId") subjectId: string,
    @Body() dto: EnrollSubjectStudentDto,
  ) {
    return this.subjectsService.enrollSubjectStudent(actor, subjectId, dto);
  }

  @Patch(":subjectId/students/:studentId")
  async updateSubjectStudent(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("subjectId") subjectId: string,
    @Param("studentId") studentId: string,
    @Body() dto: UpdateSubjectEnrollmentDto,
  ) {
    return this.subjectsService.updateSubjectStudent(actor, subjectId, studentId, dto);
  }
}
