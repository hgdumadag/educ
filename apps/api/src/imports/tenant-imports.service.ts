import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { MembershipStatus, RoleKey } from "@prisma/client";
import AdmZip from "adm-zip";

import type { AuthenticatedUser } from "../common/types/authenticated-user.type.js";
import { isContentManagerRole } from "../common/authz/roles.js";
import { LessonsService } from "../lessons/lessons.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { SubjectsService } from "../subjects/subjects.service.js";
import { recordAuditEvent } from "../utils/audit.js";
import { hashPassword } from "../utils/password.js";
import type { UploadedFile } from "../common/types/upload-file.type.js";
import type { TabularRow } from "./tabular.js";

const DEFAULT_IMPORT_PASSWORD = "ChangeMe!23";

type ImportRowError = {
  row: number;
  message: string;
};

type TenantImportKind =
  | "teachers"
  | "subjects"
  | "students"
  | "students_subjects"
  | "students_subjects_lessons";

type ImportTotals = {
  rows: number;
  createdUsers: number;
  createdMemberships: number;
  createdSubjects: number;
  createdEnrollments: number;
  createdLessons: number;
  skipped: number;
};

type ImportResult = {
  ok: true;
  kind: TenantImportKind;
  tenantId: string;
  defaultPassword: string;
  totals: ImportTotals;
  warnings: string[];
  errors: ImportRowError[];
};

function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

function readValue(row: TabularRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function readBoolean(row: TabularRow, keys: string[], fallback: boolean): boolean {
  const raw = readValue(row, keys);
  if (!raw) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "n"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function toLessonZip(args: {
  subjectName: string;
  title: string;
  gradeLevel?: string;
  markdown?: string;
}): UploadedFile {
  const zip = new AdmZip();
  const metadata = {
    title: args.title,
    gradeLevel: args.gradeLevel ?? null,
    subject: args.subjectName,
    importedBy: "bulk-import",
  };
  const markdown =
    args.markdown && args.markdown.trim()
      ? args.markdown.trim()
      : `# ${args.title}\n\n*(Imported via Axiometry bulk upload)*\n\n## Overview\nAdd lesson content here.\n`;

  zip.addFile("metadata.json", Buffer.from(JSON.stringify(metadata, null, 2), "utf8"));
  zip.addFile("content.md", Buffer.from(markdown, "utf8"));

  const safeBase = `${args.subjectName}-${args.title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "lesson";

  return {
    originalname: `${safeBase}.zip`,
    buffer: zip.toBuffer(),
  };
}

@Injectable()
export class TenantImportsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SubjectsService) private readonly subjectsService: SubjectsService,
    @Inject(LessonsService) private readonly lessonsService: LessonsService,
  ) {}

  async run(
    actor: AuthenticatedUser,
    kindRaw: string,
    rows: TabularRow[],
    parseWarnings: string[] = [],
  ): Promise<ImportResult> {
    const kind = kindRaw as TenantImportKind;

    if (
      kind !== "teachers" &&
      kind !== "subjects" &&
      kind !== "students" &&
      kind !== "students_subjects" &&
      kind !== "students_subjects_lessons"
    ) {
      throw new BadRequestException(`Unknown import kind: ${kindRaw}`);
    }

    if (kind === "teachers" && actor.activeRole !== RoleKey.school_admin && !actor.isPlatformAdmin) {
      throw new ForbiddenException("Only school admins can import teachers");
    }

    const warnings = [...parseWarnings];
    const errors: ImportRowError[] = [];
    const totals: ImportTotals = {
      rows: rows.length,
      createdUsers: 0,
      createdMemberships: 0,
      createdSubjects: 0,
      createdEnrollments: 0,
      createdLessons: 0,
      skipped: 0,
    };

    if (kind === "teachers") {
      await this.importTeachers(actor, rows, totals, warnings, errors);
    } else if (kind === "subjects") {
      await this.importSubjects(actor, rows, totals, warnings, errors);
    } else if (kind === "students") {
      await this.importStudents(actor, rows, totals, warnings, errors);
    } else if (kind === "students_subjects") {
      await this.importStudentsWithSubjects(actor, rows, totals, warnings, errors);
    } else if (kind === "students_subjects_lessons") {
      await this.importStudentsSubjectsLessons(actor, rows, totals, warnings, errors);
    }

    await recordAuditEvent(this.prisma, {
      actorUserId: actor.id,
      tenantId: actor.activeTenantId,
      membershipId: actor.activeMembershipId,
      contextRole: actor.activeRole,
      action: "import.run",
      entityType: "import",
      metadataJson: {
        kind,
        totals,
        errorCount: errors.length,
      },
    });

    return {
      ok: true,
      kind,
      tenantId: actor.activeTenantId,
      defaultPassword: DEFAULT_IMPORT_PASSWORD,
      totals,
      warnings,
      errors,
    };
  }

  private async resolveTeacherOwnerIds(
    actor: AuthenticatedUser,
    rows: TabularRow[],
    errors: ImportRowError[],
  ): Promise<Map<number, string>> {
    const result = new Map<number, string>();

    if (isContentManagerRole(actor.activeRole)) {
      for (let index = 0; index < rows.length; index += 1) {
        result.set(index, actor.id);
      }
      return result;
    }

    const teacherEmails = new Set<string>();
    for (const row of rows) {
      const email = normalizeEmail(readValue(row, ["teacher_email", "teacher", "teacher_owner_email"]));
      if (email) {
        teacherEmails.add(email);
      }
    }

    const memberships = teacherEmails.size === 0
      ? []
      : await this.prisma.membership.findMany({
          where: {
            tenantId: actor.activeTenantId,
            status: MembershipStatus.active,
            role: { in: [RoleKey.teacher, RoleKey.parent, RoleKey.tutor] },
            user: {
              email: { in: [...teacherEmails] },
              isActive: true,
            },
          },
          include: {
            user: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        });

    const emailToUserId = new Map<string, string>();
    for (const membership of memberships) {
      emailToUserId.set(membership.user.email.toLowerCase(), membership.user.id);
    }

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2; // header row is 1
      const email = normalizeEmail(readValue(rows[index], ["teacher_email", "teacher", "teacher_owner_email"]));
      if (!email) {
        errors.push({ row: rowNumber, message: "teacher_email is required for this import when run as school admin" });
        continue;
      }

      const resolved = emailToUserId.get(email);
      if (!resolved) {
        errors.push({ row: rowNumber, message: `Teacher not found or inactive in this tenant: ${email}` });
        continue;
      }

      result.set(index, resolved);
    }

    return result;
  }

  private async importTeachers(
    actor: AuthenticatedUser,
    rows: TabularRow[],
    totals: ImportTotals,
    warnings: string[],
    errors: ImportRowError[],
  ): Promise<void> {
    const seen = new Set<string>();
    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      const email = normalizeEmail(readValue(rows[index], ["teacher_email", "email"]));
      if (!email) {
        errors.push({ row: rowNumber, message: "teacher_email is required" });
        continue;
      }
      if (seen.has(email)) {
        totals.skipped += 1;
        continue;
      }
      seen.add(email);

      const name = readValue(rows[index], ["teacher_name", "name"]);
      const password = readValue(rows[index], ["teacher_password", "password"]);

      const existing = await this.prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          isActive: true,
          displayName: true,
        },
      });

      if (existing && !existing.isActive) {
        errors.push({ row: rowNumber, message: `User exists but is inactive: ${email}` });
        continue;
      }

      let userId = existing?.id ?? "";
      if (!existing) {
        const passwordToUse = password || DEFAULT_IMPORT_PASSWORD;
        const created = await this.prisma.user.create({
          data: {
            email,
            passwordHash: await hashPassword(passwordToUse),
            role: RoleKey.teacher,
            displayName: name || null,
            isActive: true,
          },
          select: { id: true },
        });
        userId = created.id;
        totals.createdUsers += 1;
      } else if (name && !existing.displayName) {
        await this.prisma.user.update({
          where: { id: existing.id },
          data: { displayName: name },
        });
      }

      const conflicting = await this.prisma.membership.findFirst({
        where: {
          tenantId: actor.activeTenantId,
          userId,
          status: MembershipStatus.active,
          role: RoleKey.school_admin,
        },
        select: { id: true },
      });
      if (conflicting) {
        errors.push({ row: rowNumber, message: `Email already belongs to a school admin in this tenant: ${email}` });
        continue;
      }

      const already = await this.prisma.membership.findFirst({
        where: {
          tenantId: actor.activeTenantId,
          userId,
          role: RoleKey.teacher,
        },
        select: { id: true },
      });

      await this.prisma.membership.upsert({
        where: {
          userId_tenantId_role: {
            userId,
            tenantId: actor.activeTenantId,
            role: RoleKey.teacher,
          },
        },
        create: {
          userId,
          tenantId: actor.activeTenantId,
          role: RoleKey.teacher,
          status: MembershipStatus.active,
          invitedById: actor.id,
        },
        update: {
          status: MembershipStatus.active,
        },
      });

      if (!already) {
        totals.createdMemberships += 1;
      }

      if (!password) {
        warnings.push(`Teacher ${email} imported without password; default password applied for new users only.`);
      }
    }
  }

  private async importSubjects(
    actor: AuthenticatedUser,
    rows: TabularRow[],
    totals: ImportTotals,
    warnings: string[],
    errors: ImportRowError[],
  ): Promise<void> {
    const teacherOwnerIds = await this.resolveTeacherOwnerIds(actor, rows, errors);
    if (errors.length > 0 && !isContentManagerRole(actor.activeRole)) {
      // If school admin rows are missing teacher ownership, stop early.
      return;
    }

    const unique = new Map<string, { teacherOwnerId: string; name: string; nameNormalized: string }>();
    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      const name = readValue(rows[index], ["subject_name", "subject", "name"]);
      if (!name) {
        errors.push({ row: rowNumber, message: "subject_name is required" });
        continue;
      }

      const teacherOwnerId = teacherOwnerIds.get(index);
      if (!teacherOwnerId) {
        continue;
      }

      const nameNormalized = name.toLowerCase();
      unique.set(`${teacherOwnerId}:${nameNormalized}`, { teacherOwnerId, name, nameNormalized });
    }

    if (unique.size === 0) {
      return;
    }

    const created = await this.prisma.subject.createMany({
      data: [...unique.values()].map((subject) => ({
        tenantId: actor.activeTenantId,
        teacherOwnerId: subject.teacherOwnerId,
        name: subject.name,
        nameNormalized: subject.nameNormalized,
        isArchived: false,
      })),
      skipDuplicates: true,
    });

    totals.createdSubjects += created.count;
    totals.skipped += unique.size - created.count;

    if (!isContentManagerRole(actor.activeRole)) {
      warnings.push("School admin subject imports require teacher_email per row.");
    }
  }

  private async importStudents(
    actor: AuthenticatedUser,
    rows: TabularRow[],
    totals: ImportTotals,
    warnings: string[],
    errors: ImportRowError[],
  ): Promise<void> {
    const seen = new Set<string>();
    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      const email = normalizeEmail(readValue(rows[index], ["student_email", "email"]));
      if (!email) {
        errors.push({ row: rowNumber, message: "student_email is required" });
        continue;
      }

      if (seen.has(email)) {
        totals.skipped += 1;
        continue;
      }
      seen.add(email);

      const name = readValue(rows[index], ["student_name", "name"]);
      const password = readValue(rows[index], ["student_password", "password"]);

      const existing = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true, isActive: true, displayName: true },
      });

      if (existing && !existing.isActive) {
        errors.push({ row: rowNumber, message: `User exists but is inactive: ${email}` });
        continue;
      }

      if (existing) {
        const conflicting = await this.prisma.membership.findFirst({
          where: {
            tenantId: actor.activeTenantId,
            userId: existing.id,
            status: MembershipStatus.active,
            role: { not: RoleKey.student },
          },
          select: { id: true, role: true },
        });
        if (conflicting) {
          errors.push({
            row: rowNumber,
            message: `Email already belongs to a non-student member in this tenant: ${email}`,
          });
          continue;
        }
      }

      let userId = existing?.id ?? "";
      if (!existing) {
        const passwordToUse = password || DEFAULT_IMPORT_PASSWORD;
        const created = await this.prisma.user.create({
          data: {
            email,
            passwordHash: await hashPassword(passwordToUse),
            role: RoleKey.student,
            displayName: name || null,
            isActive: true,
          },
          select: { id: true },
        });
        userId = created.id;
        totals.createdUsers += 1;
      } else if (name && !existing.displayName) {
        await this.prisma.user.update({
          where: { id: existing.id },
          data: { displayName: name },
        });
      }

      const already = await this.prisma.membership.findFirst({
        where: { tenantId: actor.activeTenantId, userId, role: RoleKey.student },
        select: { id: true },
      });

      await this.prisma.membership.upsert({
        where: {
          userId_tenantId_role: {
            userId,
            tenantId: actor.activeTenantId,
            role: RoleKey.student,
          },
        },
        create: {
          userId,
          tenantId: actor.activeTenantId,
          role: RoleKey.student,
          status: MembershipStatus.active,
          invitedById: actor.id,
        },
        update: {
          status: MembershipStatus.active,
        },
      });

      if (!already) {
        totals.createdMemberships += 1;
      }

      if (!password) {
        warnings.push(`Student ${email} imported without password; default password applied for new users only.`);
      }
    }
  }

  private async resolveSubjectMap(
    actor: AuthenticatedUser,
    teacherOwnerIds: Set<string>,
  ): Promise<Map<string, { id: string; name: string }>> {
    const subjects = await this.prisma.subject.findMany({
      where: {
        tenantId: actor.activeTenantId,
        teacherOwnerId: { in: [...teacherOwnerIds] },
      },
      select: { id: true, teacherOwnerId: true, name: true, nameNormalized: true },
    });
    const map = new Map<string, { id: string; name: string }>();
    for (const subject of subjects) {
      map.set(`${subject.teacherOwnerId}:${subject.nameNormalized}`, { id: subject.id, name: subject.name });
    }
    return map;
  }

  private async importStudentsWithSubjects(
    actor: AuthenticatedUser,
    rows: TabularRow[],
    totals: ImportTotals,
    warnings: string[],
    errors: ImportRowError[],
  ): Promise<void> {
    const teacherOwnerIds = await this.resolveTeacherOwnerIds(actor, rows, errors);
    const ownerSet = new Set<string>();
    for (const ownerId of teacherOwnerIds.values()) {
      ownerSet.add(ownerId);
    }
    const subjectMap = await this.resolveSubjectMap(actor, ownerSet);

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      const subjectName = readValue(rows[index], ["subject_name", "subject"]);
      const studentEmail = normalizeEmail(readValue(rows[index], ["student_email", "email"]));
      if (!subjectName) {
        errors.push({ row: rowNumber, message: "subject_name is required" });
        continue;
      }
      if (!studentEmail) {
        errors.push({ row: rowNumber, message: "student_email is required" });
        continue;
      }

      const ownerId = teacherOwnerIds.get(index);
      if (!ownerId) {
        continue;
      }

      const subjectKey = `${ownerId}:${subjectName.toLowerCase()}`;
      const subject = subjectMap.get(subjectKey);
      if (!subject) {
        errors.push({ row: rowNumber, message: `Subject not found for this owner: ${subjectName}` });
        continue;
      }

      const studentName = readValue(rows[index], ["student_name", "name"]);
      const password = readValue(rows[index], ["student_password", "password"]);
      const autoAssignFuture = readBoolean(rows[index], ["auto_assign_future", "autoassignfuture"], true);

      try {
        const result = await this.subjectsService.enrollSubjectStudent(actor, subject.id, {
          email: studentEmail,
          temporaryPassword: password || DEFAULT_IMPORT_PASSWORD,
          autoAssignFuture,
        });

        totals.createdEnrollments += 1;

        if (studentName) {
          await this.prisma.user.updateMany({
            where: { id: result.enrollment.student.id, displayName: null },
            data: { displayName: studentName },
          });
        }

        if (!password && result.createdStudent) {
          warnings.push(
            `Student ${studentEmail} created with default password (${DEFAULT_IMPORT_PASSWORD}). Share it with the student.`,
          );
        }
      } catch (error) {
        errors.push({ row: rowNumber, message: String(error) });
      }
    }
  }

  private async getOrCreateSubject(args: {
    actor: AuthenticatedUser;
    teacherOwnerId: string;
    subjectName: string;
  }): Promise<{ id: string; name: string }> {
    const name = args.subjectName.trim();
    const nameNormalized = name.toLowerCase();
    const existing = await this.prisma.subject.findFirst({
      where: {
        tenantId: args.actor.activeTenantId,
        teacherOwnerId: args.teacherOwnerId,
        nameNormalized,
      },
      select: { id: true, name: true },
    });
    if (existing) {
      return existing;
    }

    const created = await this.subjectsService.createSubject(args.actor, {
      name,
      teacherOwnerId: isContentManagerRole(args.actor.activeRole) ? undefined : args.teacherOwnerId,
    });

    return { id: created.id, name: created.name };
  }

  private async importStudentsSubjectsLessons(
    actor: AuthenticatedUser,
    rows: TabularRow[],
    totals: ImportTotals,
    warnings: string[],
    errors: ImportRowError[],
  ): Promise<void> {
    const teacherOwnerIds = await this.resolveTeacherOwnerIds(actor, rows, errors);

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      const subjectName = readValue(rows[index], ["subject_name", "subject"]);
      const studentEmail = normalizeEmail(readValue(rows[index], ["student_email", "email"]));
      const lessonTitle = readValue(rows[index], ["lesson_title", "lesson", "title"]);

      if (!subjectName) {
        errors.push({ row: rowNumber, message: "subject_name is required" });
        continue;
      }
      if (!studentEmail) {
        errors.push({ row: rowNumber, message: "student_email is required" });
        continue;
      }
      if (!lessonTitle) {
        errors.push({ row: rowNumber, message: "lesson_title is required" });
        continue;
      }

      const ownerId = teacherOwnerIds.get(index);
      if (!ownerId) {
        continue;
      }

      const studentName = readValue(rows[index], ["student_name", "name"]);
      const password = readValue(rows[index], ["student_password", "password"]);
      const autoAssignFuture = readBoolean(rows[index], ["auto_assign_future", "autoassignfuture"], true);
      const lessonGradeLevel = readValue(rows[index], ["lesson_grade_level", "grade_level", "gradelevel"]);
      const lessonMarkdown = readValue(rows[index], ["lesson_content_md", "lesson_markdown", "lesson_content", "content_md"]);

      let subject;
      try {
        subject = await this.getOrCreateSubject({ actor, teacherOwnerId: ownerId, subjectName });
      } catch (error) {
        errors.push({ row: rowNumber, message: String(error) });
        continue;
      }

      try {
        const enrollmentResult = await this.subjectsService.enrollSubjectStudent(actor, subject.id, {
          email: studentEmail,
          temporaryPassword: password || DEFAULT_IMPORT_PASSWORD,
          autoAssignFuture,
        });
        totals.createdEnrollments += 1;

        if (studentName) {
          await this.prisma.user.updateMany({
            where: { id: enrollmentResult.enrollment.student.id, displayName: null },
            data: { displayName: studentName },
          });
        }

        if (!password && enrollmentResult.createdStudent) {
          warnings.push(
            `Student ${studentEmail} created with default password (${DEFAULT_IMPORT_PASSWORD}). Share it with the student.`,
          );
        }
      } catch (error) {
        errors.push({ row: rowNumber, message: String(error) });
        continue;
      }

      const existingLesson = await this.prisma.lesson.findFirst({
        where: {
          tenantId: actor.activeTenantId,
          subjectId: subject.id,
          isDeleted: false,
          title: { equals: lessonTitle, mode: "insensitive" },
        },
        select: { id: true },
      });

      if (existingLesson) {
        totals.skipped += 1;
        continue;
      }

      const zipFile = toLessonZip({
        subjectName: subject.name,
        title: lessonTitle,
        gradeLevel: lessonGradeLevel || undefined,
        markdown: lessonMarkdown || undefined,
      });

      try {
        const result = await this.lessonsService.uploadLesson(actor, subject.id, zipFile);
        if (!result.valid) {
          errors.push({ row: rowNumber, message: result.errors.join(", ") });
          continue;
        }
        totals.createdLessons += 1;
      } catch (error) {
        errors.push({ row: rowNumber, message: String(error) });
      }
    }
  }
}

