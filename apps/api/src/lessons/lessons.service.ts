import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, RoleKey } from "@prisma/client";
import AdmZip from "adm-zip";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AuthenticatedUser } from "../common/types/authenticated-user.type.js";
import { isContentManagerRole } from "../common/authz/roles.js";
import { env } from "../env.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { SubjectsService } from "../subjects/subjects.service.js";
import { recordAuditEvent } from "../utils/audit.js";
import type { UploadedFile } from "../common/types/upload-file.type.js";

interface LessonUploadResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  normalizedPreview: unknown | null;
}

@Injectable()
export class LessonsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SubjectsService) private readonly subjectsService: SubjectsService,
  ) {}

  private async persistFile(file: UploadedFile): Promise<string> {
    const directory = path.join(env.uploadLocalPath, "lessons");
    await mkdir(directory, { recursive: true });

    const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const fullPath = path.join(directory, safeName);

    await writeFile(fullPath, file.buffer);
    return fullPath;
  }

  private toSubject(subject: { id: string; tenantId: string; name: string; teacherOwnerId: string }) {
    return {
      id: subject.id,
      tenantId: subject.tenantId,
      name: subject.name,
      teacherOwnerId: subject.teacherOwnerId,
    };
  }

  private toLessonResponse(lesson: {
    id: string;
    title: string;
    gradeLevel: string | null;
    tenantId: string;
    subject: string;
    subjectId: string;
    contentPath: string;
    metadataJson: unknown;
    uploadedById: string;
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
    subjectRef: {
      id: string;
      tenantId: string;
      name: string;
      teacherOwnerId: string;
    };
  }) {
    return {
      id: lesson.id,
      title: lesson.title,
      gradeLevel: lesson.gradeLevel,
      subjectId: lesson.subjectId,
      subject: this.toSubject(lesson.subjectRef),
      contentPath: lesson.contentPath,
      metadataJson: lesson.metadataJson,
      uploadedById: lesson.uploadedById,
      isDeleted: lesson.isDeleted,
      createdAt: lesson.createdAt,
      updatedAt: lesson.updatedAt,
    };
  }

  async uploadLesson(
    actor: AuthenticatedUser,
    subjectId: string,
    file?: UploadedFile,
  ): Promise<LessonUploadResult> {
    if (!file) {
      throw new BadRequestException("Missing upload file");
    }

    if (!subjectId || !subjectId.trim()) {
      throw new BadRequestException("subjectId is required");
    }

    const subject = await this.subjectsService.assertSubjectAccess(actor, subjectId.trim());

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!file.originalname.toLowerCase().endsWith(".zip")) {
      errors.push("Lesson package must be a ZIP file");
      return { valid: false, errors, warnings, normalizedPreview: null };
    }

    const zip = new AdmZip(file.buffer);
    const entries = zip.getEntries();

    const metadataEntry = entries.find((entry) => entry.entryName.endsWith("metadata.json"));
    const contentEntry = entries.find((entry) => entry.entryName.endsWith("content.md"));

    if (!metadataEntry || !contentEntry) {
      errors.push("Lesson package must contain metadata.json and content.md");
      return { valid: false, errors, warnings, normalizedPreview: null };
    }

    let metadata: Record<string, unknown>;
    try {
      metadata = JSON.parse(metadataEntry.getData().toString("utf8")) as Record<string, unknown>;
    } catch {
      errors.push("Invalid metadata.json format");
      return { valid: false, errors, warnings, normalizedPreview: null };
    }

    const title =
      typeof metadata.title === "string" && metadata.title.trim()
        ? metadata.title.trim()
        : "Untitled Lesson";
    const gradeLevel =
      typeof metadata.gradeLevel === "string" && metadata.gradeLevel.trim()
        ? metadata.gradeLevel.trim()
        : null;

    if (title === "Untitled Lesson") {
      warnings.push("Missing title in metadata.json; default title applied");
    }

    const contentPath = await this.persistFile(file);

    const lesson = await this.prisma.lesson.create({
      data: {
        tenantId: actor.activeTenantId,
        title,
        subject: subject.name,
        subjectId: subject.id,
        gradeLevel,
        contentPath,
        metadataJson: metadata as Prisma.InputJsonValue,
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
      subjectId: lesson.subjectId,
      lessonId: lesson.id,
    });

    await recordAuditEvent(this.prisma, {
      actorUserId: actor.id,
      tenantId: actor.activeTenantId,
      membershipId: actor.activeMembershipId,
      contextRole: actor.activeRole,
      action: "lesson.upload",
      entityType: "lesson",
      entityId: lesson.id,
      metadataJson: { title: lesson.title, subjectId: lesson.subjectId },
    });

    return {
      valid: true,
      errors,
      warnings,
      normalizedPreview: this.toLessonResponse(lesson),
    };
  }

  async listLessons(actor: AuthenticatedUser) {
    if (actor.activeRole === RoleKey.school_admin || actor.isPlatformAdmin) {
      const lessons = await this.prisma.lesson.findMany({
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
      return lessons.map((lesson) => this.toLessonResponse(lesson));
    }

    if (isContentManagerRole(actor.activeRole)) {
      const lessons = await this.prisma.lesson.findMany({
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
      return lessons.map((lesson) => this.toLessonResponse(lesson));
    }

    const assignments = await this.prisma.assignment.findMany({
      where: {
        tenantId: actor.activeTenantId,
        assigneeStudentId: actor.id,
        lessonId: { not: null },
      },
      include: {
        lesson: {
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

    const unique = new Map<string, ReturnType<LessonsService["toLessonResponse"]>>();
    for (const assignment of assignments) {
      if (assignment.lesson && !assignment.lesson.isDeleted) {
        unique.set(assignment.lesson.id, this.toLessonResponse(assignment.lesson));
      }
    }

    return [...unique.values()];
  }

  async getLesson(actor: AuthenticatedUser, lessonId: string) {
    const lesson = await this.prisma.lesson.findFirst({
      where: {
        id: lessonId,
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

    if (isContentManagerRole(actor.activeRole) && lesson.subjectRef.teacherOwnerId !== actor.id && actor.activeRole !== RoleKey.school_admin && !actor.isPlatformAdmin) {
      throw new ForbiddenException("Cannot access another owner's lessons");
    }

    if (actor.activeRole === RoleKey.student) {
      const assignment = await this.prisma.assignment.findFirst({
        where: {
          tenantId: actor.activeTenantId,
          assigneeStudentId: actor.id,
          lessonId,
        },
      });

      if (!assignment) {
        throw new ForbiddenException("Lesson is not assigned to this student");
      }
    }

    return this.toLessonResponse(lesson);
  }

  async getLessonContent(
    actor: AuthenticatedUser,
    lessonId: string,
  ): Promise<{ lessonId: string; title: string; subject: { id: string; name: string }; markdown: string }> {
    const lesson = await this.prisma.lesson.findFirst({
      where: {
        id: lessonId,
        tenantId: actor.activeTenantId,
      },
      include: {
        subjectRef: {
          select: {
            id: true,
            name: true,
            teacherOwnerId: true,
          },
        },
      },
    });
    if (!lesson || lesson.isDeleted) {
      throw new NotFoundException("Lesson not found");
    }

    if (
      isContentManagerRole(actor.activeRole) &&
      lesson.subjectRef.teacherOwnerId !== actor.id &&
      actor.activeRole !== RoleKey.school_admin &&
      !actor.isPlatformAdmin
    ) {
      throw new ForbiddenException("Cannot access another owner's lessons");
    }

    if (actor.activeRole === RoleKey.student) {
      const assignment = await this.prisma.assignment.findFirst({
        where: {
          tenantId: actor.activeTenantId,
          assigneeStudentId: actor.id,
          lessonId,
        },
        select: { id: true },
      });

      if (!assignment) {
        throw new ForbiddenException("Lesson is not assigned to this student");
      }
    }

    if (env.uploadStorageMode !== "local") {
      throw new BadRequestException("Lesson content preview is supported only in local upload mode");
    }

    let zipBuffer: Buffer;
    try {
      zipBuffer = await readFile(lesson.contentPath);
    } catch {
      throw new NotFoundException("Lesson content file is missing on disk");
    }

    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();
    const contentEntry = entries.find((entry) => entry.entryName.endsWith("content.md"));
    if (!contentEntry) {
      throw new BadRequestException("Lesson package is missing content.md");
    }

    const markdown = contentEntry.getData().toString("utf8");

    return {
      lessonId: lesson.id,
      title: lesson.title,
      subject: {
        id: lesson.subjectRef.id,
        name: lesson.subjectRef.name,
      },
      markdown,
    };
  }

  async softDelete(actor: AuthenticatedUser, lessonId: string): Promise<{ ok: true }> {
    const lesson = await this.prisma.lesson.findFirst({
      where: {
        id: lessonId,
        tenantId: actor.activeTenantId,
      },
      include: {
        subjectRef: {
          select: {
            teacherOwnerId: true,
          },
        },
      },
    });
    if (!lesson || lesson.isDeleted) {
      throw new NotFoundException("Lesson not found");
    }

    const ownerOrAdmin =
      actor.activeRole === RoleKey.school_admin || actor.isPlatformAdmin || lesson.subjectRef.teacherOwnerId === actor.id;
    if (!ownerOrAdmin) {
      throw new ForbiddenException("Only owner or school admin can delete this lesson");
    }

    await this.prisma.lesson.update({ where: { id: lessonId }, data: { isDeleted: true } });

    await recordAuditEvent(this.prisma, {
      actorUserId: actor.id,
      tenantId: actor.activeTenantId,
      membershipId: actor.activeMembershipId,
      contextRole: actor.activeRole,
      action: "lesson.delete",
      entityType: "lesson",
      entityId: lessonId,
      metadataJson: {
        subjectId: lesson.subjectId,
      },
    });

    return { ok: true };
  }
}
