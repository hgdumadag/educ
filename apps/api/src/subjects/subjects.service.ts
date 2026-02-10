import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, RoleKey } from "@prisma/client";

import type { AuthenticatedUser } from "../common/types/authenticated-user.type.js";
import { isContentManagerRole } from "../common/authz/roles.js";
import { ObservabilityService } from "../observability/observability.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { recordAuditEvent } from "../utils/audit.js";
import { hashPassword } from "../utils/password.js";
import type { CreateSubjectDto } from "./dto/create-subject.dto.js";
import type { EnrollSubjectStudentDto } from "./dto/enroll-subject-student.dto.js";
import type { ListSubjectsQueryDto } from "./dto/list-subjects-query.dto.js";
import type { UpdateSubjectEnrollmentDto } from "./dto/update-subject-enrollment.dto.js";
import type { UpdateSubjectDto } from "./dto/update-subject.dto.js";

interface SubjectAccessRecord {
  id: string;
  tenantId: string;
  teacherOwnerId: string;
  name: string;
  nameNormalized: string;
  isArchived: boolean;
}

interface AutoAssignResult {
  lessonCreated: number;
  lessonCandidates: number;
  examCreated: number;
  examCandidates: number;
}

interface EnsureEnrollmentResult {
  enrollmentId: string;
  created: boolean;
}

const AUTO_ASSIGNMENT_TYPE: Prisma.AssignmentCreateManyInput["assignmentType"] = "practice";
const AUTO_ASSIGNMENT_MAX_ATTEMPTS = 3;

@Injectable()
export class SubjectsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ObservabilityService) private readonly observability: ObservabilityService,
  ) {}

  private normalizeSubjectName(input: string): { name: string; nameNormalized: string } {
    const name = input.trim();
    if (!name) {
      throw new BadRequestException("Subject name is required");
    }

    return {
      name,
      nameNormalized: name.toLowerCase(),
    };
  }

  private normalizeEmail(input: string): string {
    return input.trim().toLowerCase();
  }

  private assertCanManageSubjects(actor: AuthenticatedUser): void {
    if (actor.activeRole === RoleKey.school_admin || actor.isPlatformAdmin || isContentManagerRole(actor.activeRole)) {
      return;
    }

    throw new ForbiddenException("Role cannot manage subjects");
  }

  private async assertTeacherExists(tenantId: string, teacherOwnerId: string): Promise<void> {
    const membership = await this.prisma.membership.findFirst({
      where: {
        tenantId,
        userId: teacherOwnerId,
        status: "active",
        role: {
          in: [RoleKey.teacher, RoleKey.parent, RoleKey.tutor],
        },
        user: {
          isActive: true,
        },
      },
      select: { id: true },
    });

    if (!membership) {
      throw new BadRequestException("Teacher owner must be an active teacher/parent/tutor member in this tenant");
    }
  }

  private async resolveCreateOwnerId(
    actor: AuthenticatedUser,
    teacherOwnerId?: string,
  ): Promise<string> {
    if (isContentManagerRole(actor.activeRole)) {
      return actor.id;
    }

    if (actor.activeRole !== RoleKey.school_admin && !actor.isPlatformAdmin) {
      throw new ForbiddenException("Only school admin or content manager can create subjects");
    }

    if (!teacherOwnerId) {
      throw new BadRequestException("teacherOwnerId is required for school admin subject creation");
    }

    await this.assertTeacherExists(actor.activeTenantId, teacherOwnerId);
    return teacherOwnerId;
  }

  private async getSubjectForActor(
    actor: AuthenticatedUser,
    subjectId: string,
  ): Promise<SubjectAccessRecord> {
    const subject = await this.prisma.subject.findFirst({
      where: {
        id: subjectId,
        tenantId: actor.activeTenantId,
      },
      select: {
        id: true,
        tenantId: true,
        teacherOwnerId: true,
        name: true,
        nameNormalized: true,
        isArchived: true,
      },
    });

    if (!subject) {
      throw new NotFoundException("Subject not found");
    }

    if (isContentManagerRole(actor.activeRole) && subject.teacherOwnerId !== actor.id && !actor.isPlatformAdmin) {
      throw new ForbiddenException("Cannot access another owner's subject");
    }

    if (actor.activeRole === RoleKey.student && !actor.isPlatformAdmin) {
      throw new ForbiddenException("Students cannot manage subjects");
    }

    return subject;
  }

  private async materializeAssignmentsForEnrollmentTx(
    tx: Prisma.TransactionClient,
    args: {
      tenantId: string;
      subjectId: string;
      enrollmentId: string;
      studentId: string;
      assignedByTeacherId: string;
    },
  ): Promise<AutoAssignResult> {
    const [lessons, exams] = await Promise.all([
      tx.lesson.findMany({
        where: {
          tenantId: args.tenantId,
          subjectId: args.subjectId,
          isDeleted: false,
        },
        select: { id: true },
      }),
      tx.exam.findMany({
        where: {
          tenantId: args.tenantId,
          subjectId: args.subjectId,
          isDeleted: false,
        },
        select: { id: true },
      }),
    ]);

    const lessonRows = lessons.map((lesson) => ({
      tenantId: args.tenantId,
      assigneeStudentId: args.studentId,
      assignedByTeacherId: args.assignedByTeacherId,
      lessonId: lesson.id,
      assignmentSource: "subject_auto" as const,
      subjectEnrollmentId: args.enrollmentId,
      assignmentType: AUTO_ASSIGNMENT_TYPE,
      maxAttempts: AUTO_ASSIGNMENT_MAX_ATTEMPTS,
      dueAt: null,
    }));
    const examRows = exams.map((exam) => ({
      tenantId: args.tenantId,
      assigneeStudentId: args.studentId,
      assignedByTeacherId: args.assignedByTeacherId,
      examId: exam.id,
      assignmentSource: "subject_auto" as const,
      subjectEnrollmentId: args.enrollmentId,
      assignmentType: AUTO_ASSIGNMENT_TYPE,
      maxAttempts: AUTO_ASSIGNMENT_MAX_ATTEMPTS,
      dueAt: null,
    }));

    const lessonCreated = lessonRows.length > 0
      ? (await tx.assignment.createMany({ data: lessonRows, skipDuplicates: true })).count
      : 0;
    const examCreated = examRows.length > 0
      ? (await tx.assignment.createMany({ data: examRows, skipDuplicates: true })).count
      : 0;

    return {
      lessonCandidates: lessonRows.length,
      lessonCreated,
      examCandidates: examRows.length,
      examCreated,
    };
  }

  private recordAutoAssignMetrics(result: AutoAssignResult): void {
    const created = result.lessonCreated + result.examCreated;
    const skipped =
      (result.lessonCandidates + result.examCandidates) -
      (result.lessonCreated + result.examCreated);

    if (created > 0) {
      this.observability.incrementCounter("subject.auto_assign.created", created);
    }
    if (skipped > 0) {
      this.observability.incrementCounter("subject.auto_assign.skipped", skipped);
    }
  }

  async createSubject(actor: AuthenticatedUser, dto: CreateSubjectDto) {
    this.assertCanManageSubjects(actor);
    const ownerId = await this.resolveCreateOwnerId(actor, dto.teacherOwnerId);
    const { name, nameNormalized } = this.normalizeSubjectName(dto.name);

    try {
      const subject = await this.prisma.subject.create({
        data: {
          tenantId: actor.activeTenantId,
          teacherOwnerId: ownerId,
          name,
          nameNormalized,
        },
        include: {
          teacherOwner: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      await recordAuditEvent(this.prisma, {
        actorUserId: actor.id,
        tenantId: actor.activeTenantId,
        membershipId: actor.activeMembershipId,
        contextRole: actor.activeRole,
        action: "subject.create",
        entityType: "subject",
        entityId: subject.id,
        metadataJson: {
          teacherOwnerId: subject.teacherOwnerId,
          name: subject.name,
        },
      });

      return subject;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Subject name already exists for this owner");
      }
      throw error;
    }
  }

  async listSubjects(actor: AuthenticatedUser, query: ListSubjectsQueryDto) {
    this.assertCanManageSubjects(actor);

    const includeArchived = query.includeArchived ?? false;
    const where: Prisma.SubjectWhereInput = {
      tenantId: actor.activeTenantId,
      ...(includeArchived ? {} : { isArchived: false }),
    };

    if (isContentManagerRole(actor.activeRole)) {
      where.teacherOwnerId = actor.id;
    } else if (query.teacherId) {
      where.teacherOwnerId = query.teacherId;
    }

    return this.prisma.subject.findMany({
      where,
      include: {
        teacherOwner: {
          select: {
            id: true,
            email: true,
          },
        },
        _count: {
          select: {
            lessons: true,
            exams: true,
            enrollments: true,
          },
        },
      },
      orderBy: [{ isArchived: "asc" }, { createdAt: "desc" }],
    });
  }

  async updateSubject(actor: AuthenticatedUser, subjectId: string, dto: UpdateSubjectDto) {
    this.assertCanManageSubjects(actor);
    await this.getSubjectForActor(actor, subjectId);

    const data: Prisma.SubjectUpdateInput = {};
    if (dto.name !== undefined) {
      const normalized = this.normalizeSubjectName(dto.name);
      data.name = normalized.name;
      data.nameNormalized = normalized.nameNormalized;
    }
    if (dto.isArchived !== undefined) {
      data.isArchived = dto.isArchived;
    }

    const updated = await this.prisma.subject.update({
      where: { id: subjectId },
      data,
      include: {
        teacherOwner: {
          select: {
            id: true,
            email: true,
          },
        },
        _count: {
          select: {
            lessons: true,
            exams: true,
            enrollments: true,
          },
        },
      },
    });

    await recordAuditEvent(this.prisma, {
      actorUserId: actor.id,
      tenantId: actor.activeTenantId,
      membershipId: actor.activeMembershipId,
      contextRole: actor.activeRole,
      action: "subject.update",
      entityType: "subject",
      entityId: updated.id,
      metadataJson: {
        teacherOwnerId: updated.teacherOwnerId,
        name: updated.name,
        isArchived: updated.isArchived,
      },
    });

    return updated;
  }

  async listSubjectStudents(actor: AuthenticatedUser, subjectId: string) {
    this.assertCanManageSubjects(actor);
    await this.getSubjectForActor(actor, subjectId);

    return this.prisma.subjectEnrollment.findMany({
      where: {
        tenantId: actor.activeTenantId,
        subjectId,
      },
      include: {
        student: {
          select: {
            id: true,
            email: true,
            displayName: true,
            isActive: true,
          },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
  }

  async enrollSubjectStudent(
    actor: AuthenticatedUser,
    subjectId: string,
    dto: EnrollSubjectStudentDto,
  ) {
    this.assertCanManageSubjects(actor);
    const subject = await this.getSubjectForActor(actor, subjectId);
    const email = this.normalizeEmail(dto.email);

    let student = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, displayName: true, isActive: true },
    });

    let createdStudent = false;

    if (student && !student.isActive) {
      throw new BadRequestException("Student account is inactive");
    }

    if (!student) {
      if (!dto.temporaryPassword) {
        throw new BadRequestException("temporaryPassword is required when creating a new student account");
      }

      const created = await this.prisma.user.create({
        data: {
          email,
          passwordHash: await hashPassword(dto.temporaryPassword),
          role: RoleKey.student,
          isActive: true,
        },
        select: {
          id: true,
          email: true,
          displayName: true,
          isActive: true,
        },
      });
      student = created;
      createdStudent = true;
    }

    if (!student) {
      throw new Error("Invariant failed: student missing after enrollment resolution");
    }

    const studentId = student.id;
    const autoAssignFuture = dto.autoAssignFuture ?? true;

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.membership.upsert({
        where: {
          userId_tenantId_role: {
            userId: studentId,
            tenantId: actor.activeTenantId,
            role: RoleKey.student,
          },
        },
        create: {
          userId: studentId,
          tenantId: actor.activeTenantId,
          role: RoleKey.student,
          status: "active",
          invitedById: actor.id,
        },
        update: {
          status: "active",
        },
      });

      const enrollment = await tx.subjectEnrollment.upsert({
        where: {
          tenantId_subjectId_studentId: {
            tenantId: actor.activeTenantId,
            subjectId,
            studentId: studentId,
          },
        },
        create: {
          tenantId: actor.activeTenantId,
          subjectId,
          studentId: studentId,
          status: "active",
          autoAssignFuture,
          enrolledByUserId: actor.id,
        },
        update: {
          status: "active",
          completedAt: null,
          completedByUserId: null,
          ...(dto.autoAssignFuture !== undefined
            ? { autoAssignFuture: dto.autoAssignFuture }
            : {}),
        },
        include: {
          student: {
            select: {
              id: true,
              email: true,
              displayName: true,
              isActive: true,
            },
          },
        },
      });

      const autoAssignments = await this.materializeAssignmentsForEnrollmentTx(tx, {
        tenantId: actor.activeTenantId,
        subjectId,
        enrollmentId: enrollment.id,
        studentId: studentId,
        assignedByTeacherId: subject.teacherOwnerId,
      });

      return {
        enrollment,
        autoAssignments,
      };
    });

    this.recordAutoAssignMetrics(result.autoAssignments);
    this.observability.incrementCounter("subject.enrollment.created", 1);

    await recordAuditEvent(this.prisma, {
      actorUserId: actor.id,
      tenantId: actor.activeTenantId,
      membershipId: actor.activeMembershipId,
      contextRole: actor.activeRole,
      action: "subject.enroll",
      entityType: "subject_enrollment",
      entityId: result.enrollment.id,
      metadataJson: {
        subjectId,
        studentId: result.enrollment.studentId,
        teacherOwnerId: subject.teacherOwnerId,
        autoAssignFuture: result.enrollment.autoAssignFuture,
        createdStudent,
        assignedLessons: result.autoAssignments.lessonCreated,
        assignedExams: result.autoAssignments.examCreated,
      },
    });

    return {
      enrollment: result.enrollment,
      assignments: {
        lessonsCreated: result.autoAssignments.lessonCreated,
        examsCreated: result.autoAssignments.examCreated,
      },
      createdStudent,
    };
  }

  async updateSubjectStudent(
    actor: AuthenticatedUser,
    subjectId: string,
    studentId: string,
    dto: UpdateSubjectEnrollmentDto,
  ) {
    this.assertCanManageSubjects(actor);
    const subject = await this.getSubjectForActor(actor, subjectId);

    const existing = await this.prisma.subjectEnrollment.findUnique({
      where: {
        tenantId_subjectId_studentId: {
          tenantId: actor.activeTenantId,
          subjectId,
          studentId,
        },
      },
      include: {
        student: {
          select: {
            id: true,
            email: true,
            displayName: true,
            isActive: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException("Subject enrollment not found");
    }

    const data: Prisma.SubjectEnrollmentUncheckedUpdateInput = {};
    if (dto.autoAssignFuture !== undefined) {
      data.autoAssignFuture = dto.autoAssignFuture;
    }

    if (dto.status === "completed") {
      data.status = "completed";
      data.completedAt = new Date();
      data.completedByUserId = actor.id;
    }

    if (dto.status === "active") {
      data.status = "active";
      data.completedAt = null;
      data.completedByUserId = null;
    }

    const updated = await this.prisma.subjectEnrollment.update({
      where: { id: existing.id },
      data,
      include: {
        student: {
          select: {
            id: true,
            email: true,
            displayName: true,
            isActive: true,
          },
        },
      },
    });

    let autoAssignments: AutoAssignResult | null = null;
    if (updated.status === "active") {
      autoAssignments = await this.prisma.$transaction(async (tx) =>
        this.materializeAssignmentsForEnrollmentTx(tx, {
          tenantId: actor.activeTenantId,
          subjectId,
          enrollmentId: updated.id,
          studentId: updated.studentId,
          assignedByTeacherId: subject.teacherOwnerId,
        })
      );
      this.recordAutoAssignMetrics(autoAssignments);
    }

    const action = updated.status === "completed" ? "subject.complete" : "subject.enroll";
    if (updated.status === "completed") {
      this.observability.incrementCounter("subject.enrollment.completed", 1);
    }
    if (updated.status === "active" && existing.status === "completed") {
      this.observability.incrementCounter("subject.enrollment.reactivated", 1);
    }

    await recordAuditEvent(this.prisma, {
      actorUserId: actor.id,
      tenantId: actor.activeTenantId,
      membershipId: actor.activeMembershipId,
      contextRole: actor.activeRole,
      action,
      entityType: "subject_enrollment",
      entityId: updated.id,
      metadataJson: {
        subjectId,
        studentId: updated.studentId,
        teacherOwnerId: subject.teacherOwnerId,
        previousStatus: existing.status,
        status: updated.status,
        autoAssignFuture: updated.autoAssignFuture,
        assignedLessons: autoAssignments?.lessonCreated ?? 0,
        assignedExams: autoAssignments?.examCreated ?? 0,
      },
    });

    return {
      enrollment: updated,
      assignments: autoAssignments
        ? {
            lessonsCreated: autoAssignments.lessonCreated,
            examsCreated: autoAssignments.examCreated,
          }
        : {
            lessonsCreated: 0,
            examsCreated: 0,
          },
    };
  }

  async assertSubjectAccess(actor: AuthenticatedUser, subjectId: string): Promise<SubjectAccessRecord> {
    const subject = await this.getSubjectForActor(actor, subjectId);
    if (subject.isArchived) {
      throw new BadRequestException("Subject is archived");
    }
    return subject;
  }

  async ensureEnrollmentForManualAssignment(args: {
    tenantId: string;
    subjectId: string;
    studentId: string;
    actorUserId: string;
    actorMembershipId?: string;
    actorRole?: RoleKey;
    teacherOwnerId: string;
  }): Promise<EnsureEnrollmentResult> {
    const existing = await this.prisma.subjectEnrollment.findUnique({
      where: {
        tenantId_subjectId_studentId: {
          tenantId: args.tenantId,
          subjectId: args.subjectId,
          studentId: args.studentId,
        },
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      return {
        enrollmentId: existing.id,
        created: false,
      };
    }

    const created = await this.prisma.subjectEnrollment.create({
      data: {
        tenantId: args.tenantId,
        subjectId: args.subjectId,
        studentId: args.studentId,
        status: "active",
        autoAssignFuture: false,
        enrolledByUserId: args.actorUserId,
      },
      select: {
        id: true,
      },
    });

    this.observability.incrementCounter("subject.enrollment.created", 1);

    await recordAuditEvent(this.prisma, {
      actorUserId: args.actorUserId,
      tenantId: args.tenantId,
      membershipId: args.actorMembershipId,
      contextRole: args.actorRole,
      action: "subject.enroll",
      entityType: "subject_enrollment",
      entityId: created.id,
      metadataJson: {
        subjectId: args.subjectId,
        studentId: args.studentId,
        teacherOwnerId: args.teacherOwnerId,
        autoAssignFuture: false,
        source: "manual_assignment",
      },
    });

    return {
      enrollmentId: created.id,
      created: true,
    };
  }

  async autoAssignNewContent(args: {
    tenantId: string;
    actorUserId: string;
    actorMembershipId?: string;
    actorRole?: RoleKey;
    subjectId: string;
    lessonId?: string;
    examId?: string;
  }): Promise<AutoAssignResult> {
    if (!args.lessonId && !args.examId) {
      return {
        lessonCandidates: 0,
        lessonCreated: 0,
        examCandidates: 0,
        examCreated: 0,
      };
    }

    const subject = await this.prisma.subject.findFirst({
      where: {
        id: args.subjectId,
        tenantId: args.tenantId,
      },
      select: {
        id: true,
        tenantId: true,
        teacherOwnerId: true,
      },
    });

    if (!subject) {
      throw new NotFoundException("Subject not found");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const activeEnrollments = await tx.subjectEnrollment.findMany({
        where: {
          tenantId: args.tenantId,
          subjectId: subject.id,
          status: "active",
          autoAssignFuture: true,
        },
        select: {
          id: true,
          studentId: true,
        },
      });

      if (activeEnrollments.length === 0) {
        return {
          lessonCandidates: 0,
          lessonCreated: 0,
          examCandidates: 0,
          examCreated: 0,
        } satisfies AutoAssignResult;
      }

      const lessonRows = args.lessonId
        ? activeEnrollments.map((enrollment) => ({
            tenantId: args.tenantId,
            assigneeStudentId: enrollment.studentId,
            assignedByTeacherId: subject.teacherOwnerId,
            lessonId: args.lessonId,
            assignmentSource: "subject_auto" as const,
            subjectEnrollmentId: enrollment.id,
            assignmentType: AUTO_ASSIGNMENT_TYPE,
            maxAttempts: AUTO_ASSIGNMENT_MAX_ATTEMPTS,
            dueAt: null,
          }))
        : [];

      const examRows = args.examId
        ? activeEnrollments.map((enrollment) => ({
            tenantId: args.tenantId,
            assigneeStudentId: enrollment.studentId,
            assignedByTeacherId: subject.teacherOwnerId,
            examId: args.examId,
            assignmentSource: "subject_auto" as const,
            subjectEnrollmentId: enrollment.id,
            assignmentType: AUTO_ASSIGNMENT_TYPE,
            maxAttempts: AUTO_ASSIGNMENT_MAX_ATTEMPTS,
            dueAt: null,
          }))
        : [];

      const lessonCreated = lessonRows.length > 0
        ? (await tx.assignment.createMany({ data: lessonRows, skipDuplicates: true })).count
        : 0;
      const examCreated = examRows.length > 0
        ? (await tx.assignment.createMany({ data: examRows, skipDuplicates: true })).count
        : 0;

      return {
        lessonCandidates: lessonRows.length,
        lessonCreated,
        examCandidates: examRows.length,
        examCreated,
      } satisfies AutoAssignResult;
    });

    this.recordAutoAssignMetrics(result);

    if (result.lessonCreated > 0 || result.examCreated > 0) {
      await recordAuditEvent(this.prisma, {
        actorUserId: args.actorUserId,
        tenantId: args.tenantId,
        membershipId: args.actorMembershipId,
        contextRole: args.actorRole,
        action: "subject.auto_assign",
        entityType: "subject",
        entityId: args.subjectId,
        metadataJson: {
          teacherOwnerId: subject.teacherOwnerId,
          lessonId: args.lessonId,
          examId: args.examId,
          lessonsAssigned: result.lessonCreated,
          examsAssigned: result.examCreated,
        },
      });
    }

    return result;
  }
}
