import { Injectable, NotFoundException } from "@nestjs/common";
import { RoleKey } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service.js";
import { recordAuditEvent } from "../utils/audit.js";
import { hashPassword } from "../utils/password.js";
import type { AuthenticatedUser } from "../common/types/authenticated-user.type.js";
import type { CreateUserDto } from "./dto/create-user.dto.js";
import type { ResetPasswordDto } from "./dto/reset-password.dto.js";
import type { UpdateRoleLabelDto } from "./dto/update-role-label.dto.js";
import type { UpdateUserDto } from "./dto/update-user.dto.js";

const DEFAULT_LABELS: Record<RoleKey, string> = {
  admin: "Admin",
  teacher: "Teacher",
  student: "Student",
};

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(actor: AuthenticatedUser, dto: CreateUserDto) {
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase().trim(),
        passwordHash: await hashPassword(dto.password),
        role: dto.role,
      },
      select: { id: true, email: true, role: true, isActive: true, createdAt: true },
    });

    await recordAuditEvent(this.prisma, {
      actorUserId: actor.id,
      action: "admin.user.create",
      entityType: "user",
      entityId: user.id,
    });

    return user;
  }

  async updateUser(actor: AuthenticatedUser, userId: string, dto: UpdateUserDto) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: dto.email?.toLowerCase().trim(),
        role: dto.role,
        isActive: dto.isActive,
      },
      select: { id: true, email: true, role: true, isActive: true, updatedAt: true },
    });

    await recordAuditEvent(this.prisma, {
      actorUserId: actor.id,
      action: "admin.user.update",
      entityType: "user",
      entityId: userId,
      metadataJson: dto,
    });

    return updated;
  }

  async resetPassword(actor: AuthenticatedUser, userId: string, dto: ResetPasswordDto) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(dto.password),
        refreshTokenHash: null,
      },
    });

    await recordAuditEvent(this.prisma, {
      actorUserId: actor.id,
      action: "admin.user.reset_password",
      entityType: "user",
      entityId: userId,
    });

    return { ok: true };
  }

  async deactivateUser(actor: AuthenticatedUser, userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false, refreshTokenHash: null },
    });

    await recordAuditEvent(this.prisma, {
      actorUserId: actor.id,
      action: "admin.user.deactivate",
      entityType: "user",
      entityId: userId,
    });

    return { ok: true };
  }

  async getRoleLabels() {
    const existing = await this.prisma.roleLabel.findMany();
    const merged = Object.values(RoleKey).map((roleKey) => {
      const configured = existing.find((entry) => entry.roleKey === roleKey);
      return {
        roleKey,
        displayLabel: configured?.displayLabel ?? DEFAULT_LABELS[roleKey],
      };
    });

    return merged;
  }

  async updateRoleLabel(
    actor: AuthenticatedUser,
    roleKey: RoleKey,
    dto: UpdateRoleLabelDto,
  ) {
    const updated = await this.prisma.roleLabel.upsert({
      where: { roleKey },
      update: { displayLabel: dto.displayLabel.trim(), updatedById: actor.id },
      create: {
        roleKey,
        displayLabel: dto.displayLabel.trim(),
        updatedById: actor.id,
      },
    });

    await recordAuditEvent(this.prisma, {
      actorUserId: actor.id,
      action: "admin.role_label.update",
      entityType: "role_label",
      entityId: roleKey,
      metadataJson: { displayLabel: dto.displayLabel },
    });

    return updated;
  }

  async getAttemptsReport() {
    const attempts = await this.prisma.attempt.findMany({
      include: {
        exam: { select: { id: true, title: true, subject: true } },
        student: { select: { id: true, email: true } },
      },
      orderBy: { startedAt: "desc" },
    });

    return attempts.map((attempt) => ({
      id: attempt.id,
      status: attempt.status,
      scorePercent: attempt.scorePercent,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      student: attempt.student,
      exam: attempt.exam,
    }));
  }

  async exportAttemptsCsv(): Promise<string> {
    const attempts = await this.getAttemptsReport();
    const header = [
      "attemptId",
      "studentId",
      "studentEmail",
      "examId",
      "examTitle",
      "status",
      "scorePercent",
      "startedAt",
      "submittedAt",
    ];

    const rows = attempts.map((attempt) => [
      attempt.id,
      attempt.student.id,
      attempt.student.email,
      attempt.exam.id,
      attempt.exam.title,
      attempt.status,
      String(attempt.scorePercent ?? ""),
      attempt.startedAt.toISOString(),
      attempt.submittedAt?.toISOString() ?? "",
    ]);

    return [header, ...rows]
      .map((cells) => cells.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");
  }

  async getAuditEvents() {
    return this.prisma.auditEvent.findMany({
      include: {
        actor: { select: { id: true, email: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
  }

  async assertUserExists(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException("User not found");
    }
  }
}
