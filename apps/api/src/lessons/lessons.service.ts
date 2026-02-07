import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import AdmZip from "adm-zip";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "../env.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { recordAuditEvent } from "../utils/audit.js";
import type { AuthenticatedUser } from "../common/types/authenticated-user.type.js";
import type { UploadedFile } from "../common/types/upload-file.type.js";

interface LessonUploadResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  normalizedPreview: unknown | null;
}

@Injectable()
export class LessonsService {
  constructor(private readonly prisma: PrismaService) {}

  private async persistFile(file: UploadedFile): Promise<string> {
    const directory = path.join(env.uploadLocalPath, "lessons");
    await mkdir(directory, { recursive: true });

    const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const fullPath = path.join(directory, safeName);

    await writeFile(fullPath, file.buffer);
    return fullPath;
  }

  async uploadLesson(
    actor: AuthenticatedUser,
    file?: UploadedFile,
  ): Promise<LessonUploadResult> {
    if (!file) {
      throw new BadRequestException("Missing upload file");
    }

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
    const subject =
      typeof metadata.subject === "string" && metadata.subject.trim()
        ? metadata.subject.trim()
        : "General";
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
        title,
        subject,
        gradeLevel,
        contentPath,
        metadataJson: metadata as Prisma.JsonObject,
        uploadedById: actor.id,
      },
      select: {
        id: true,
        title: true,
        subject: true,
        gradeLevel: true,
        createdAt: true,
      },
    });

    await recordAuditEvent(this.prisma, {
      actorUserId: actor.id,
      action: "lesson.upload",
      entityType: "lesson",
      entityId: lesson.id,
      metadataJson: { title: lesson.title },
    });

    return {
      valid: true,
      errors,
      warnings,
      normalizedPreview: lesson,
    };
  }

  async listLessons(actor: AuthenticatedUser) {
    if (actor.role === "admin") {
      return this.prisma.lesson.findMany({ where: { isDeleted: false }, orderBy: { createdAt: "desc" } });
    }

    if (actor.role === "teacher") {
      return this.prisma.lesson.findMany({
        where: { isDeleted: false, uploadedById: actor.id },
        orderBy: { createdAt: "desc" },
      });
    }

    const assignments = await this.prisma.assignment.findMany({
      where: {
        assigneeStudentId: actor.id,
        lessonId: { not: null },
      },
      include: { lesson: true },
      orderBy: { createdAt: "desc" },
    });

    const unique = new Map<string, unknown>();
    for (const assignment of assignments) {
      if (assignment.lesson && !assignment.lesson.isDeleted) {
        unique.set(assignment.lesson.id, assignment.lesson);
      }
    }

    return [...unique.values()];
  }

  async getLesson(actor: AuthenticatedUser, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson || lesson.isDeleted) {
      throw new NotFoundException("Lesson not found");
    }

    if (actor.role === "teacher" && lesson.uploadedById !== actor.id) {
      throw new ForbiddenException("Teachers can only access owned lessons");
    }

    if (actor.role === "student") {
      const assignment = await this.prisma.assignment.findFirst({
        where: {
          assigneeStudentId: actor.id,
          lessonId,
        },
      });

      if (!assignment) {
        throw new ForbiddenException("Lesson is not assigned to this student");
      }
    }

    return lesson;
  }

  async softDelete(actor: AuthenticatedUser, lessonId: string): Promise<{ ok: true }> {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson || lesson.isDeleted) {
      throw new NotFoundException("Lesson not found");
    }

    const ownerOrAdmin = actor.role === "admin" || lesson.uploadedById === actor.id;
    if (!ownerOrAdmin) {
      throw new ForbiddenException("Only owner or admin can delete this lesson");
    }

    await this.prisma.lesson.update({ where: { id: lessonId }, data: { isDeleted: true } });

    await recordAuditEvent(this.prisma, {
      actorUserId: actor.id,
      action: "lesson.delete",
      entityType: "lesson",
      entityId: lessonId,
    });

    return { ok: true };
  }
}
