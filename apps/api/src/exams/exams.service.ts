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

import { OpenAiService } from "../openai/openai.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { recordAuditEvent } from "../utils/audit.js";
import { env } from "../env.js";
import type { AuthenticatedUser } from "../common/types/authenticated-user.type.js";
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

@Injectable()
export class ExamsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OpenAiService) private readonly openAiService: OpenAiService,
  ) {}

  private async persistFile(file: UploadedFile): Promise<string> {
    const directory = path.join(env.uploadLocalPath, "exams");
    await mkdir(directory, { recursive: true });

    const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const fullPath = path.join(directory, safeName);

    await writeFile(fullPath, file.buffer);
    return fullPath;
  }

  private assertTeacherOwnership(actor: AuthenticatedUser, lessonId?: string, examId?: string): Promise<void> {
    if (actor.role === RoleKey.admin) {
      return Promise.resolve();
    }

    return (async () => {
      if (lessonId) {
        const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
        if (!lesson || lesson.uploadedById !== actor.id || lesson.isDeleted) {
          throw new ForbiddenException("Teacher does not own lesson");
        }
      }

      if (examId) {
        const exam = await this.prisma.exam.findUnique({ where: { id: examId } });
        if (!exam || exam.uploadedById !== actor.id || exam.isDeleted) {
          throw new ForbiddenException("Teacher does not own exam");
        }
      }
    })();
  }

  async uploadExam(actor: AuthenticatedUser, file?: UploadedFile): Promise<ValidationResult> {
    if (!file) {
      throw new BadRequestException("Missing upload file");
    }

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
        title: normalized.normalized.title,
        subject: normalized.normalized.subject,
        settingsJson: normalized.normalized.settings,
        normalizedJson: {
          ...normalized.normalized,
          sourcePath: persistedPath,
        } as unknown as Prisma.JsonObject,
        normalizedSchemaVersion: "v1",
        uploadedById: actor.id,
      },
      select: {
        id: true,
        title: true,
        subject: true,
        normalizedSchemaVersion: true,
        createdAt: true,
      },
    });

    await recordAuditEvent(this.prisma, {
      actorUserId: actor.id,
      action: "exam.upload",
      entityType: "exam",
      entityId: exam.id,
      metadataJson: {
        title: exam.title,
      },
    });

    return {
      valid: true,
      errors,
      warnings: [...warnings, ...normalized.warnings],
      normalizedPreview: {
        ...exam,
        questionCount: normalized.normalized.questions.length,
      },
    };
  }

  async listExams(actor: AuthenticatedUser) {
    if (actor.role === RoleKey.admin) {
      return this.prisma.exam.findMany({ where: { isDeleted: false }, orderBy: { createdAt: "desc" } });
    }

    if (actor.role === RoleKey.teacher) {
      return this.prisma.exam.findMany({
        where: { isDeleted: false, uploadedById: actor.id },
        orderBy: { createdAt: "desc" },
      });
    }

    const assignments = await this.prisma.assignment.findMany({
      where: {
        assigneeStudentId: actor.id,
        examId: { not: null },
      },
      include: { exam: true },
      orderBy: { createdAt: "desc" },
    });

    const unique = new Map<string, unknown>();
    for (const assignment of assignments) {
      if (assignment.exam && !assignment.exam.isDeleted) {
        unique.set(assignment.exam.id, assignment.exam);
      }
    }

    return [...unique.values()];
  }

  async getExam(actor: AuthenticatedUser, examId: string) {
    const exam = await this.prisma.exam.findUnique({ where: { id: examId } });
    if (!exam || exam.isDeleted) {
      throw new NotFoundException("Exam not found");
    }

    if (actor.role === RoleKey.teacher && exam.uploadedById !== actor.id) {
      throw new ForbiddenException("Teachers can only access owned exams");
    }

    if (actor.role === RoleKey.student) {
      const assignment = await this.prisma.assignment.findFirst({
        where: {
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
      subject: exam.subject,
      settings: exam.settingsJson,
      normalizedSchemaVersion: exam.normalizedSchemaVersion,
      questions: (exam.normalizedJson as unknown as NormalizedExam).questions,
    };
  }

  async createAssignment(actor: AuthenticatedUser, dto: CreateAssignmentDto) {
    if (!dto.lessonId && !dto.examId) {
      throw new BadRequestException("Assignment must reference lessonId or examId");
    }

    await this.assertTeacherOwnership(actor, dto.lessonId, dto.examId);

    const students = await this.prisma.user.findMany({
      where: {
        id: { in: dto.studentIds },
        role: RoleKey.student,
        isActive: true,
      },
      select: { id: true },
    });

    if (students.length !== dto.studentIds.length) {
      throw new BadRequestException("One or more student IDs are invalid or inactive");
    }

    const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    const assignmentType: AssignmentTypeValue = dto.assignmentType ?? "practice";
    const maxAttempts = dto.maxAttempts ?? (assignmentType === "assessment" ? 1 : 3);

    const created = await this.prisma.$transaction(
      dto.studentIds.map((studentId) =>
        this.prisma.assignment.create({
          data: {
            assigneeStudentId: studentId,
            assignedByTeacherId: actor.id,
            lessonId: dto.lessonId,
            examId: dto.examId,
            assignmentType,
            maxAttempts,
            dueAt,
          },
        }),
      ),
    );

    await recordAuditEvent(this.prisma, {
      actorUserId: actor.id,
      action: "assignment.create",
      entityType: "assignment_batch",
      metadataJson: {
        studentCount: created.length,
        lessonId: dto.lessonId,
        examId: dto.examId,
        assignmentType,
        maxAttempts,
      },
    });

    return created;
  }

  async getMyAssignments(student: AuthenticatedUser) {
    const assignments = await this.prisma.assignment.findMany({
      where: {
        assigneeStudentId: student.id,
      },
      include: {
        _count: { select: { attempts: true } },
        lesson: {
          select: {
            id: true,
            title: true,
            subject: true,
            gradeLevel: true,
          },
        },
        exam: {
          select: {
            id: true,
            title: true,
            subject: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return assignments.map((assignment) => ({
      id: assignment.id,
      assigneeStudentId: assignment.assigneeStudentId,
      assignedByTeacherId: assignment.assignedByTeacherId,
      lessonId: assignment.lessonId,
      examId: assignment.examId,
      dueAt: assignment.dueAt,
      createdAt: assignment.createdAt,
      assignmentType: assignment.assignmentType,
      maxAttempts: assignment.maxAttempts,
      attemptsUsed: assignment._count.attempts,
      lesson: assignment.lesson,
      exam: assignment.exam,
    }));
  }

  async createAttempt(student: AuthenticatedUser, dto: CreateAttemptDto) {
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.findFirst({
        where: {
          id: dto.assignmentId,
          assigneeStudentId: student.id,
        },
      });

      if (!assignment) {
        throw new ForbiddenException("Assignment is not available for this student");
      }

      if (!assignment.examId) {
        throw new BadRequestException("This assignment does not include an exam");
      }

      const exam = await tx.exam.findUnique({ where: { id: assignment.examId } });
      if (!exam || exam.isDeleted) {
        throw new NotFoundException("Exam not found");
      }

      const inProgress = await tx.attempt.findFirst({
        where: {
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
          assignmentId: assignment.id,
          studentId: student.id,
        },
      });
      if (attemptsUsed >= assignment.maxAttempts) {
        throw new BadRequestException("Maximum attempts reached for this assignment");
      }

      return tx.attempt.create({
        data: {
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
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
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
        studentId: student.id,
        status: "in_progress",
      },
      data: {
        status: "submitted",
        submittedAt: new Date(),
      },
    });

    if (markedSubmitted.count === 0) {
      const existing = await this.prisma.attempt.findUnique({
        where: { id: attemptId },
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

    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
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
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            subject: true,
            settingsJson: true,
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

    if (actor.role === RoleKey.student && attempt.studentId !== actor.id) {
      throw new ForbiddenException("Students can only view their own results");
    }

    if (actor.role === RoleKey.teacher) {
      const assignment = await this.prisma.assignment.findUnique({
        where: {
          id: attempt.assignmentId,
        },
      });

      if (!assignment || assignment.assignedByTeacherId !== actor.id) {
        throw new ForbiddenException("Teacher does not have access to this attempt");
      }
    }

    return attempt;
  }
}
