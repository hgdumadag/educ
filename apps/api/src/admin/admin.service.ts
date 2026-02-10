import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MembershipStatus, RoleKey } from "@prisma/client";

import type { AuthenticatedUser } from "../common/types/authenticated-user.type.js";
import { ObservabilityService } from "../observability/observability.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { recordAuditEvent } from "../utils/audit.js";
import { toCsvCell } from "../utils/csv.js";
import { hashPassword } from "../utils/password.js";
import type { CreateUserDto } from "./dto/create-user.dto.js";
import type { ResetPasswordDto } from "./dto/reset-password.dto.js";
import type { UpdateRoleLabelDto } from "./dto/update-role-label.dto.js";
import type { UpdateUserDto } from "./dto/update-user.dto.js";

const DEFAULT_LABELS: Record<RoleKey, string> = {
  platform_admin: "Platform Admin",
  school_admin: "School Admin",
  teacher: "Teacher",
  student: "Student",
  parent: "Parent",
  tutor: "Tutor",
};

const TENANT_MANAGEABLE_ROLES = new Set<RoleKey>([
  RoleKey.school_admin,
  RoleKey.teacher,
  RoleKey.student,
  RoleKey.parent,
  RoleKey.tutor,
]);

@Injectable()
export class AdminService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ObservabilityService) private readonly observability: ObservabilityService,
  ) {}

  private assertSchoolAdmin(actor: AuthenticatedUser): void {
    if (actor.activeRole !== RoleKey.school_admin && !actor.isPlatformAdmin) {
      throw new ForbiddenException("School admin role is required");
    }
  }

  private toPagination(page: number, pageSize: number): { page: number; pageSize: number } {
    const normalizedPage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const normalizedPageSize = Number.isFinite(pageSize) && pageSize > 0
      ? Math.min(Math.floor(pageSize), 200)
      : 50;

    return {
      page: normalizedPage,
      pageSize: normalizedPageSize,
    };
  }

  private async assertTenantUser(tenantId: string, userId: string): Promise<void> {
    const membership = await this.prisma.membership.findFirst({
      where: {
        tenantId,
        userId,
        status: MembershipStatus.active,
      },
      select: { id: true },
    });

    if (!membership) {
      throw new NotFoundException("User is not a member of this tenant");
    }
  }

  async createUser(actor: AuthenticatedUser, dto: CreateUserDto) {
    this.assertSchoolAdmin(actor);

    if (!TENANT_MANAGEABLE_ROLES.has(dto.role) || dto.role === RoleKey.platform_admin) {
      throw new BadRequestException("Unsupported role for tenant user creation");
    }

    const email = dto.email.toLowerCase().trim();

    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException("User with this email already exists");
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(dto.password),
        role: dto.role,
        memberships: {
          create: {
            tenantId: actor.activeTenantId,
            role: dto.role,
            status: MembershipStatus.active,
            invitedById: actor.id,
          },
        },
      },
      select: { id: true, email: true, displayName: true, role: true, isActive: true, createdAt: true },
    });

    await recordAuditEvent(this.prisma, {
      actorUserId: actor.id,
      tenantId: actor.activeTenantId,
      membershipId: actor.activeMembershipId,
      contextRole: actor.activeRole,
      action: "admin.user.create",
      entityType: "user",
      entityId: user.id,
      metadataJson: { role: dto.role },
    });

    return user;
  }

  async listUsers(actor: AuthenticatedUser, args: { role?: RoleKey }) {
    this.assertSchoolAdmin(actor);

    if (args.role && (!TENANT_MANAGEABLE_ROLES.has(args.role) || args.role === RoleKey.platform_admin)) {
      throw new BadRequestException("Invalid role filter");
    }

    const memberships = await this.prisma.membership.findMany({
      where: {
        tenantId: actor.activeTenantId,
        status: MembershipStatus.active,
        ...(args.role ? { role: args.role } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return memberships.map((membership) => ({
      id: membership.user.id,
      email: membership.user.email,
      role: membership.role,
      isActive: membership.user.isActive,
      createdAt: membership.user.createdAt,
    }));
  }

  async updateUser(actor: AuthenticatedUser, userId: string, dto: UpdateUserDto) {
    this.assertSchoolAdmin(actor);
    await this.assertTenantUser(actor.activeTenantId, userId);

    if (dto.role && (!TENANT_MANAGEABLE_ROLES.has(dto.role) || dto.role === RoleKey.platform_admin)) {
      throw new BadRequestException("Invalid role update for tenant user");
    }

    const updateData: {
      email?: string;
      role?: RoleKey;
      isActive?: boolean;
    } = {};

    if (dto.email !== undefined) {
      updateData.email = dto.email.toLowerCase().trim();
    }

    if (dto.role !== undefined) {
      updateData.role = dto.role;
    }

    if (dto.isActive !== undefined) {
      updateData.isActive = dto.isActive;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: updateData,
        select: { id: true, email: true, displayName: true, role: true, isActive: true, updatedAt: true },
      });

      if (dto.role !== undefined) {
        await tx.membership.upsert({
          where: {
            userId_tenantId_role: {
              userId,
              tenantId: actor.activeTenantId,
              role: dto.role,
            },
          },
          create: {
            userId,
            tenantId: actor.activeTenantId,
            role: dto.role,
            status: MembershipStatus.active,
            invitedById: actor.id,
          },
          update: {
            status: MembershipStatus.active,
          },
        });

        await tx.membership.updateMany({
          where: {
            userId,
            tenantId: actor.activeTenantId,
            role: { not: dto.role },
          },
          data: {
            status: dto.isActive === false ? MembershipStatus.disabled : MembershipStatus.disabled,
          },
        });
      }

      if (dto.isActive === false) {
        await tx.membership.updateMany({
          where: { userId, tenantId: actor.activeTenantId },
          data: { status: MembershipStatus.disabled },
        });
      }

      if (dto.isActive === true) {
        await tx.membership.updateMany({
          where: { userId, tenantId: actor.activeTenantId },
          data: { status: MembershipStatus.active },
        });
      }

      return user;
    });

    await recordAuditEvent(this.prisma, {
      actorUserId: actor.id,
      tenantId: actor.activeTenantId,
      membershipId: actor.activeMembershipId,
      contextRole: actor.activeRole,
      action: "admin.user.update",
      entityType: "user",
      entityId: userId,
      metadataJson: dto,
    });

    return updated;
  }

  async resetPassword(actor: AuthenticatedUser, userId: string, dto: ResetPasswordDto) {
    this.assertSchoolAdmin(actor);
    await this.assertTenantUser(actor.activeTenantId, userId);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(dto.password),
        refreshTokenHash: null,
      },
    });

    await recordAuditEvent(this.prisma, {
      actorUserId: actor.id,
      tenantId: actor.activeTenantId,
      membershipId: actor.activeMembershipId,
      contextRole: actor.activeRole,
      action: "admin.user.reset_password",
      entityType: "user",
      entityId: userId,
    });

    return { ok: true };
  }

  async deactivateUser(actor: AuthenticatedUser, userId: string) {
    this.assertSchoolAdmin(actor);
    await this.assertTenantUser(actor.activeTenantId, userId);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { isActive: false, refreshTokenHash: null },
      }),
      this.prisma.membership.updateMany({
        where: { userId, tenantId: actor.activeTenantId },
        data: { status: MembershipStatus.disabled },
      }),
    ]);

    await recordAuditEvent(this.prisma, {
      actorUserId: actor.id,
      tenantId: actor.activeTenantId,
      membershipId: actor.activeMembershipId,
      contextRole: actor.activeRole,
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
    this.assertSchoolAdmin(actor);

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
      tenantId: actor.activeTenantId,
      membershipId: actor.activeMembershipId,
      contextRole: actor.activeRole,
      action: "admin.role_label.update",
      entityType: "role_label",
      entityId: roleKey,
      metadataJson: { displayLabel: dto.displayLabel },
    });

    return updated;
  }

  async getAttemptsReport(actor: AuthenticatedUser, args: { page: number; pageSize: number }) {
    this.assertSchoolAdmin(actor);

    const { page, pageSize } = this.toPagination(args.page, args.pageSize);
    const [attempts, total] = await this.prisma.$transaction([
      this.prisma.attempt.findMany({
        where: { tenantId: actor.activeTenantId },
        include: {
          exam: { select: { id: true, title: true, subject: true } },
          student: { select: { id: true, email: true } },
        },
        orderBy: { startedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.attempt.count({ where: { tenantId: actor.activeTenantId } }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: attempts.map((attempt) => ({
        id: attempt.id,
        status: attempt.status,
        scorePercent: attempt.scorePercent,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        student: attempt.student,
        exam: attempt.exam,
      })),
    };
  }

  async exportAttemptsCsv(actor: AuthenticatedUser): Promise<string> {
    this.assertSchoolAdmin(actor);

    const attempts = await this.prisma.attempt.findMany({
      where: { tenantId: actor.activeTenantId },
      include: {
        exam: { select: { id: true, title: true, subject: true } },
        student: { select: { id: true, email: true } },
      },
      orderBy: { startedAt: "desc" },
      take: 10000,
    });
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
      .map((cells) => cells.map((cell) => toCsvCell(cell)).join(","))
      .join("\n");
  }

  async getAuditEvents(actor: AuthenticatedUser, args: { page: number; pageSize: number }) {
    this.assertSchoolAdmin(actor);

    const { page, pageSize } = this.toPagination(args.page, args.pageSize);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditEvent.findMany({
        where: { tenantId: actor.activeTenantId },
        include: {
          actor: { select: { id: true, email: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditEvent.count({ where: { tenantId: actor.activeTenantId } }),
    ]);

    return {
      page,
      pageSize,
      total,
      items,
    };
  }

  getOperationalMetrics() {
    return this.observability.snapshot();
  }

  async assertUserExists(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException("User not found");
    }
  }
}
