import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, RoleKey } from "@prisma/client";
import { gradeObjectiveQuestion, normalizeExamPayload } from "@educ/exam-engine";
import type { GradedQuestion, NormalizedExam, NormalizedQuestion } from "@educ/shared-types";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AuthenticatedUser } from "../common/types/authenticated-user.type.js";
import { isContentManagerRole } from "../common/authz/roles.js";
import { env } from "../env.js";
import { OpenAiService } from "../openai/openai.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { SubjectsService } from "../subjects/subjects.service.js";
import { recordAuditEvent } from "../utils/audit.js";
import type { UploadedFile } from "../common/types/upload-file.type.js";
import type { CreateAssignmentDto } from "./dto/create-assignment.dto.js";
import type { AssignmentTypeValue } from "./dto/create-assignment.dto.js";
import type { CreateAttemptDto } from "./dto/create-attempt.dto.js";
import type { SaveResponsesDto } from "./dto/save-responses.dto.js";

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  normalizedPreview: unknown | null;
}

interface SubjectShape {
  id: string;
  tenantId: string;
  name: string;
  teacherOwnerId: string;
}

@Injectable()
export class ExamsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OpenAiService) private readonly openAiService: OpenAiService,
    @Inject(SubjectsService) private readonly subjectsService: SubjectsService,
  ) {}

  private async persistFile(file: UploadedFile): Promise<string> {
    const directory = path.join(env.uploadLocalPath, "exams");
    await mkdir(directory, { recursive: true });

    const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const fullPath = path.join(directory, safeName);

    await writeFile(fullPath, file.buffer);
    return fullPath;
  }

  private toSubject(subject: SubjectShape) {
    return {
      id: subject.id,
      tenantId: subject.tenantId,
      name: subject.name,
      teacherOwnerId: subject.teacherOwnerId,
    };
  }

  private toExamSummary(exam: {
    id: string;
    title: string;
    tenantId: string;
    subjectId: string;
    subjectRef: SubjectShape;
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: exam.id,
      title: exam.title,
      tenantId: exam.tenantId,
      subjectId: exam.subjectId,
      subject: this.toSubject(exam.subjectRef),
      isDeleted: exam.isDeleted,
      createdAt: exam.createdAt,
      updatedAt: exam.updatedAt,
    };
  }

  private async resolveAssignmentTarget(
    actor: AuthenticatedUser,
    dto: CreateAssignmentDto,
  ): Promise<{ subject: SubjectShape; lessonId?: string; examId?: string }> {
    if (dto.lessonId && dto.examId) {
      throw new BadRequestException("Assignment must reference exactly one of lessonId or examId");
    }

    if (!dto.lessonId && !dto.examId) {
      throw new BadRequestException("Assignment must reference lessonId or examId");
    }

    if (dto.lessonId) {
      const lesson = await this.prisma.lesson.findFirst({
        where: {
          id: dto.lessonId,
          tenantId: actor.activeTenantId,
        },
        include: {
          subjectRef: {
            select: {
              id: true,
              tenantId: true,
              name: true,
              teacherOwnerId: true,
            },
          },
        },
      });

      if (!lesson || lesson.isDeleted) {
        throw new NotFoundException("Lesson not found");
      }

      await this.subjectsService.assertSubjectAccess(actor, lesson.subjectId);

      return {
        subject: lesson.subjectRef,
        lessonId: lesson.id,
      };
    }

    const exam = await this.prisma.exam.findFirst({
      where: {
        id: dto.examId,
        tenantId: actor.activeTenantId,
      },
      include: {
        subjectRef: {
          select: {
            id: true,
            tenantId: true,
            name: true,
            teacherOwnerId: true,
          },
        },
      },
    });

    if (!exam || exam.isDeleted) {
      throw new NotFoundException("Exam not found");
    }

    await this.subjectsService.assertSubjectAccess(actor, exam.subjectId);

    return {
      subject: exam.subjectRef,
      examId: exam.id,
    };
  }

  async uploadExam(actor: AuthenticatedUser, subjectId: string, file?: UploadedFile): Promise<ValidationResult> {
    if (!file) {
      throw new BadRequestException("Missing upload file");
    }

    if (!subjectId || !subjectId.trim()) {
      throw new BadRequestException("subjectId is required");
    }

    const subject = await this.subjectsService.assertSubjectAccess(actor, subjectId.trim());

    const errors: string[] = [];
    const warnings: string[] = [];

    let payload: unknown;
    try {
      payload = JSON.parse(file.buffer.toString("utf8"));
    } catch {
      errors.push("Malformed JSON payload");
      return {
        valid: false,
        errors,
        warnings,
        normalizedPreview: null,
      };
    }

    const normalized = normalizeExamPayload(payload);
    if (!normalized.normalized || normalized.errors.length > 0) {
      return {
        valid: false,
        errors: normalized.errors,
        warnings: normalized.warnings,
        normalizedPreview: null,
      };
    }

    const persistedPath = await this.persistFile(file);

    const exam = await this.prisma.exam.create({
      data: {
        tenantId: actor.activeTenantId,
        title: normalized.normalized.title,
        subject: subject.name,
        subjectId: subject.id,
        settingsJson: normalized.normalized.settings,
        normalizedJson: {
          ...normalized.normalized,
          sourcePath: persistedPath,
        } as unknown as Prisma.JsonObject,
        normalizedSchemaVersion: "v1",
        uploadedById: actor.id,
      },
      include: {
        subjectRef: {
          select: {
            id: true,
            tenantId: true,
            name: true,
            teacherOwnerId: true,
          },
        },
      },
    });

    await this.subjectsService.autoAssignNewContent({
      tenantId: actor.activeTenantId,
      actorUserId: actor.id,
      actorMembershipId: actor.activeMembershipId,
      actorRole: actor.activeRole,
      subjectId: exam.subjectId,
      examId: exam.id,
    });

    await recordAuditEvent(this.prisma, {
      actorUserId: actor.id,
      tenantId: actor.activeTenantId,
      membershipId: actor.activeMembershipId,
      contextRole: actor.activeRole,
      action: "exam.upload",
      entityType: "exam",
      entityId: exam.id,
      metadataJson: {
        title: exam.title,
        subjectId: exam.subjectId,
      },
    });

    return {
      valid: true,
      errors,
      warnings: [...warnings, ...normalized.warnings],
      normalizedPreview: {
        ...this.toExamSummary(exam),
        questionCount: normalized.normalized.questions.length,
      },
    };
  }

  async listExams(actor: AuthenticatedUser) {
    if (actor.activeRole === RoleKey.school_admin || actor.isPlatformAdmin) {
      const exams = await this.prisma.exam.findMany({
        where: {
          tenantId: actor.activeTenantId,
          isDeleted: false,
        },
        include: {
          subjectRef: {
            select: {
              id: true,
              tenantId: true,
              name: true,
              teacherOwnerId: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
      return exams.map((exam) => this.toExamSummary(exam));
    }

    if (isContentManagerRole(actor.activeRole)) {
      const exams = await this.prisma.exam.findMany({
        where: {
          tenantId: actor.activeTenantId,
          isDeleted: false,
          subjectRef: {
            teacherOwnerId: actor.id,
          },
        },
        include: {
          subjectRef: {
            select: {
              id: true,
              tenantId: true,
              name: true,
              teacherOwnerId: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
      return exams.map((exam) => this.toExamSummary(exam));
    }

    const assignments = await this.prisma.assignment.findMany({
      where: {
        tenantId: actor.activeTenantId,
        assigneeStudentId: actor.id,
        examId: { not: null },
      },
      include: {
        exam: {
          include: {
            subjectRef: {
              select: {
                id: true,
                tenantId: true,
                name: true,
                teacherOwnerId: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const unique = new Map<string, ReturnType<ExamsService["toExamSummary"]>>();
    for (const assignment of assignments) {
      if (assignment.exam && !assignment.exam.isDeleted) {
        unique.set(assignment.exam.id, this.toExamSummary(assignment.exam));
      }
    }

    return [...unique.values()];
  }

  async getExam(actor: AuthenticatedUser, examId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: {
        id: examId,
        tenantId: actor.activeTenantId,
      },
      include: {
        subjectRef: {
          select: {
            id: true,
            tenantId: true,
            name: true,
            teacherOwnerId: true,
          },
        },
      },
    });
    if (!exam || exam.isDeleted) {
      throw new NotFoundException("Exam not found");
    }

    if (isContentManagerRole(actor.activeRole) && exam.subjectRef.teacherOwnerId !== actor.id && actor.activeRole !== RoleKey.school_admin && !actor.isPlatformAdmin) {
      throw new ForbiddenException("Cannot access another owner's exams");
    }

    if (actor.activeRole === RoleKey.student) {
      const assignment = await this.prisma.assignment.findFirst({
        where: {
          tenantId: actor.activeTenantId,
          assigneeStudentId: actor.id,
          examId,
        },
      });

      if (!assignment) {
        throw new ForbiddenException("Exam is not assigned to this student");
      }
    }

    return {
      id: exam.id,
      title: exam.title,
      subjectId: exam.subjectId,
      subject: this.toSubject(exam.subjectRef),
      settings: exam.settingsJson,
      normalizedSchemaVersion: exam.normalizedSchemaVersion,
      questions: (exam.normalizedJson as unknown as NormalizedExam).questions,
    };
  }

  async createAssignment(actor: AuthenticatedUser, dto: CreateAssignmentDto) {
    const target = await this.resolveAssignmentTarget(actor, dto);
    const studentIds = [...new Set(dto.studentIds.map((studentId) => studentId.trim()).filter(Boolean))];

    if (studentIds.length === 0) {
      throw new BadRequestException("At least one student ID is required");
    }

    const students = await this.prisma.user.findMany({
      where: {
        id: { in: studentIds },
        isActive: true,
        memberships: {
          some: {
            tenantId: actor.activeTenantId,
            role: RoleKey.student,
            status: "active",
          },
        },
      },
      select: { id: true },
    });

    if (students.length !== studentIds.length) {
      throw new BadRequestException("One or more student IDs are invalid/inactive or not in this tenant");
    }

    const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (dueAt && Number.isNaN(dueAt.valueOf())) {
      throw new BadRequestException("Invalid dueAt date");
    }

    const assignmentType: AssignmentTypeValue = dto.assignmentType ?? "practice";
    const maxAttempts = dto.maxAttempts ?? (assignmentType === "assessment" ? 1 : 3);

    const enrollments = new Map<string, string>();
    for (const studentId of studentIds) {
      const enrollment = await this.subjectsService.ensureEnrollmentForManualAssignment({
        tenantId: actor.activeTenantId,
        subjectId: target.subject.id,
        studentId,
        actorUserId: actor.id,
        actorMembershipId: actor.activeMembershipId,
        actorRole: actor.activeRole,
        teacherOwnerId: target.subject.teacherOwnerId,
      });
      enrollments.set(studentId, enrollment.enrollmentId);
    }

    const created = await this.prisma.$transaction(
      studentIds.map((studentId) =>
        this.prisma.assignment.create({
          data: {
            tenantId: actor.activeTenantId,
            assigneeStudentId: studentId,
            assignedByTeacherId: target.subject.teacherOwnerId,
            lessonId: target.lessonId,
            examId: target.examId,
            assignmentSource: "manual",
            subjectEnrollmentId: enrollments.get(studentId),
            assignmentType,
            maxAttempts,
            dueAt,
          },
        }),
      ),
    );

    await recordAuditEvent(this.prisma, {
      actorUserId: actor.id,
      tenantId: actor.activeTenantId,
      membershipId: actor.activeMembershipId,
      contextRole: actor.activeRole,
      action: "assignment.create",
      entityType: "assignment_batch",
      metadataJson: {
        studentCount: created.length,
        lessonId: target.lessonId,
        examId: target.examId,
        subjectId: target.subject.id,
        teacherOwnerId: target.subject.teacherOwnerId,
        assignmentType,
        maxAttempts,
      },
    });

    return created;
  }

  async getMyAssignments(student: AuthenticatedUser) {
    const assignments = await this.prisma.assignment.findMany({
      where: {
        tenantId: student.activeTenantId,
        assigneeStudentId: student.id,
      },
      include: {
        _count: { select: { attempts: true } },
        subjectEnrollment: {
          select: {
            status: true,
          },
        },
        lesson: {
          select: {
            id: true,
            title: true,
            gradeLevel: true,
            subjectId: true,
            subjectRef: {
              select: {
                id: true,
                tenantId: true,
                name: true,
                teacherOwnerId: true,
              },
            },
          },
        },
        exam: {
          select: {
            id: true,
            title: true,
            subjectId: true,
            subjectRef: {
              select: {
                id: true,
                tenantId: true,
                name: true,
                teacherOwnerId: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return assignments.map((assignment) => {
      const subject = assignment.lesson?.subjectRef ?? assignment.exam?.subjectRef ?? null;

      return {
        id: assignment.id,
        assigneeStudentId: assignment.assigneeStudentId,
        assignedByTeacherId: assignment.assignedByTeacherId,
        lessonId: assignment.lessonId,
        examId: assignment.examId,
        dueAt: assignment.dueAt,
        createdAt: assignment.createdAt,
        assignmentType: assignment.assignmentType,
        assignmentSource: assignment.assignmentSource,
        maxAttempts: assignment.maxAttempts,
        attemptsUsed: assignment._count.attempts,
        subjectEnrollmentStatus: assignment.subjectEnrollment?.status ?? null,
        subject: subject
          ? {
              id: subject.id,
              tenantId: subject.tenantId,
              name: subject.name,
              teacherOwnerId: subject.teacherOwnerId,
            }
          : null,
        lesson: assignment.lesson
          ? {
              id: assignment.lesson.id,
              title: assignment.lesson.title,
              gradeLevel: assignment.lesson.gradeLevel,
              subject: {
                id: assignment.lesson.subjectRef.id,
                tenantId: assignment.lesson.subjectRef.tenantId,
                name: assignment.lesson.subjectRef.name,
                teacherOwnerId: assignment.lesson.subjectRef.teacherOwnerId,
              },
            }
          : null,
        exam: assignment.exam
          ? {
              id: assignment.exam.id,
              title: assignment.exam.title,
              subject: {
                id: assignment.exam.subjectRef.id,
                tenantId: assignment.exam.subjectRef.tenantId,
                name: assignment.exam.subjectRef.name,
                teacherOwnerId: assignment.exam.subjectRef.teacherOwnerId,
              },
            }
          : null,
      };
    });
  }

  async createAttempt(student: AuthenticatedUser, dto: CreateAttemptDto) {
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.findFirst({
        where: {
          id: dto.assignmentId,
          tenantId: student.activeTenantId,
          assigneeStudentId: student.id,
        },
      });

      if (!assignment) {
        throw new ForbiddenException("Assignment is not available for this student");
      }

      if (!assignment.examId) {
        throw new BadRequestException("This assignment does not include an exam");
      }

      const exam = await tx.exam.findFirst({ where: { id: assignment.examId, tenantId: student.activeTenantId } });
      if (!exam || exam.isDeleted) {
        throw new NotFoundException("Exam not found");
      }

      const inProgress = await tx.attempt.findFirst({
        where: {
          tenantId: student.activeTenantId,
          assignmentId: assignment.id,
          studentId: student.id,
          status: "in_progress",
        },
        select: { id: true },
      });
      if (inProgress) {
        throw new BadRequestException("Complete the in-progress attempt before creating a new one");
      }

      const attemptsUsed = await tx.attempt.count({
        where: {
          tenantId: student.activeTenantId,
          assignmentId: assignment.id,
          studentId: student.id,
        },
      });
      if (attemptsUsed >= assignment.maxAttempts) {
        throw new BadRequestException("Maximum attempts reached for this assignment");
      }

      return tx.attempt.create({
        data: {
          tenantId: student.activeTenantId,
          assignmentId: assignment.id,
          examId: assignment.examId,
          studentId: student.id,
          status: "in_progress",
        },
        select: {
          id: true,
          assignmentId: true,
          examId: true,
          studentId: true,
          status: true,
          startedAt: true,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async saveResponses(student: AuthenticatedUser, attemptId: string, dto: SaveResponsesDto) {
    const attempt = await this.prisma.attempt.findFirst({
      where: {
        id: attemptId,
        tenantId: student.activeTenantId,
      },
      include: {
        exam: {
          select: {
            normalizedJson: true,
          },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException("Attempt not found");
    }

    if (attempt.studentId !== student.id) {
      throw new ForbiddenException("Cannot modify another student's attempt");
    }

    if (attempt.status !== "in_progress") {
      throw new BadRequestException("Only in-progress attempts can be autosaved");
    }

    const normalizedExam = attempt.exam.normalizedJson as unknown as NormalizedExam;
    const validQuestionIds = new Set(
      Array.isArray(normalizedExam?.questions)
        ? normalizedExam.questions.map((question) => question.id)
        : [],
    );

    const invalidQuestion = dto.responses.find(
      (response) =>
        !response.questionId || !validQuestionIds.has(response.questionId) || response.answer === undefined,
    );
    if (invalidQuestion) {
      throw new BadRequestException(`Invalid response payload for question ${invalidQuestion.questionId}`);
    }

    await this.prisma.$transaction(
      dto.responses.map((response) =>
        this.prisma.response.upsert({
          where: {
            attemptId_questionId: {
              attemptId,
              questionId: response.questionId,
            },
          },
          update: {
            answerJson: response.answer as Prisma.InputJsonValue,
          },
          create: {
            attemptId,
            questionId: response.questionId,
            answerJson: response.answer as Prisma.InputJsonValue,
          },
        }),
      ),
    );

    return { ok: true };
  }

  private async gradeTextQuestion(question: NormalizedQuestion, answer: unknown): Promise<GradedQuestion> {
    if (typeof answer !== "string" || !answer.trim()) {
      return {
        questionId: question.id,
        scorePercent: 0,
        feedback: "No answer submitted",
        needsReview: true,
      };
    }

    try {
      const result = await this.openAiService.gradeTextAnswer({
        prompt: question.prompt,
        rubric: question.rubric,
        answer,
      });

      return {
        questionId: question.id,
        scorePercent: result.scorePercent,
        feedback: result.feedback,
        needsReview: false,
      };
    } catch {
      return {
        questionId: question.id,
        scorePercent: 0,
        feedback: "OpenAI grading unavailable; marked for manual review",
        needsReview: true,
      };
    }
  }

  async submitAttempt(student: AuthenticatedUser, attemptId: string) {
    const markedSubmitted = await this.prisma.attempt.updateMany({
      where: {
        id: attemptId,
        tenantId: student.activeTenantId,
        studentId: student.id,
        status: "in_progress",
      },
      data: {
        status: "submitted",
        submittedAt: new Date(),
      },
    });

    if (markedSubmitted.count === 0) {
      const existing = await this.prisma.attempt.findFirst({
        where: { id: attemptId, tenantId: student.activeTenantId },
        select: { id: true, studentId: true, status: true },
      });
      if (!existing) {
        throw new NotFoundException("Attempt not found");
      }
      if (existing.studentId !== student.id) {
        throw new ForbiddenException("Cannot submit another student's attempt");
      }
      throw new BadRequestException("Attempt is already submitted");
    }

    const attempt = await this.prisma.attempt.findFirst({
      where: {
        id: attemptId,
        tenantId: student.activeTenantId,
      },
      include: {
        exam: true,
        responses: true,
      },
    });
    if (!attempt) {
      throw new NotFoundException("Attempt not found");
    }

    const exam = attempt.exam.normalizedJson as unknown as NormalizedExam;
    if (!exam || !Array.isArray(exam.questions)) {
      throw new BadRequestException("Exam schema is missing or malformed");
    }

    const responseMap = new Map<string, unknown>();
    for (const response of attempt.responses) {
      responseMap.set(response.questionId, response.answerJson as unknown);
    }

    const gradedQuestions: GradedQuestion[] = [];
    let objectiveCount = 0;
    let llmCount = 0;

    for (const question of exam.questions) {
      const answer = responseMap.get(question.id);

      if (question.type === "multiple-choice" || question.type === "true-false") {
        objectiveCount += 1;
        gradedQuestions.push(gradeObjectiveQuestion(question, answer));
      } else {
        llmCount += 1;
        gradedQuestions.push(await this.gradeTextQuestion(question, answer));
      }
    }

    const reviewCount = gradedQuestions.filter((item) => item.needsReview).length;
    const totalScore = gradedQuestions.reduce((sum, item) => sum + item.scorePercent, 0);
    const scorePercent = Math.round(totalScore / Math.max(gradedQuestions.length, 1));
    const status = reviewCount > 0 ? "needs_review" : "graded";

    const updatedAttempt = await this.prisma.$transaction(async (tx) => {
      await Promise.all(
        gradedQuestions.map((result) =>
          tx.response.upsert({
            where: {
              attemptId_questionId: {
                attemptId,
                questionId: result.questionId,
              },
            },
            update: {
              gradingJson: result as unknown as Prisma.InputJsonValue,
            },
            create: {
              attemptId,
              questionId: result.questionId,
              answerJson: (responseMap.get(result.questionId) ?? null) as Prisma.InputJsonValue,
              gradingJson: result as unknown as Prisma.InputJsonValue,
            },
          }),
        ),
      );

      return tx.attempt.update({
        where: { id: attemptId },
        data: {
          status,
          scorePercent,
          gradingSummaryJson: {
            objectiveCount,
            llmCount,
            reviewCount,
          },
        },
        include: {
          responses: true,
        },
      });
    });

    await recordAuditEvent(this.prisma, {
      actorUserId: student.id,
      tenantId: student.activeTenantId,
      membershipId: student.activeMembershipId,
      contextRole: student.activeRole,
      action: "attempt.submit",
      entityType: "attempt",
      entityId: attemptId,
      metadataJson: {
        status,
        scorePercent,
      },
    });

    return {
      id: updatedAttempt.id,
      status: updatedAttempt.status,
      scorePercent: updatedAttempt.scorePercent,
      submittedAt: updatedAttempt.submittedAt,
      gradingSummary: updatedAttempt.gradingSummaryJson,
    };
  }

  async getAttemptResult(actor: AuthenticatedUser, attemptId: string) {
    const attempt = await this.prisma.attempt.findFirst({
      where: {
        id: attemptId,
        tenantId: actor.activeTenantId,
      },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            subjectId: true,
            settingsJson: true,
            subjectRef: {
              select: {
                id: true,
                tenantId: true,
                name: true,
                teacherOwnerId: true,
              },
            },
          },
        },
        responses: true,
        student: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException("Attempt not found");
    }

    if (actor.activeRole === RoleKey.student && attempt.studentId !== actor.id) {
      throw new ForbiddenException("Students can only view their own results");
    }

    if (isContentManagerRole(actor.activeRole)) {
      const assignment = await this.prisma.assignment.findFirst({
        where: {
          id: attempt.assignmentId,
          tenantId: actor.activeTenantId,
        },
      });

      if (!assignment || assignment.assignedByTeacherId !== actor.id) {
        throw new ForbiddenException("Owner does not have access to this attempt");
      }
    }

    return {
      ...attempt,
      exam: {
        ...attempt.exam,
        subject: this.toSubject(attempt.exam.subjectRef),
      },
    };
  }
}
