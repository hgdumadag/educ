import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  BillingOwnerType,
  MembershipStatus,
  RoleKey,
  TenantType,
} from "@prisma/client";

import type { AuthenticatedUser } from "../common/types/authenticated-user.type.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { recordAuditEvent } from "../utils/audit.js";
import { hashPassword } from "../utils/password.js";
import type { AddInstitutionAdminDto } from "./dto/add-institution-admin.dto.js";
import type { CreateBillingAccountDto } from "./dto/create-billing-account.dto.js";
import type { CreateInstitutionDto } from "./dto/create-institution.dto.js";
import type { CreateMembershipDto } from "./dto/create-membership.dto.js";
import type { CreateSubscriptionDto } from "./dto/create-subscription.dto.js";
import type { UpdateInstitutionDto } from "./dto/update-institution.dto.js";
import type { UpdateMembershipDto } from "./dto/update-membership.dto.js";

const TENANT_ASSIGNABLE_ROLES = new Set<RoleKey>([
  RoleKey.school_admin,
  RoleKey.teacher,
  RoleKey.student,
  RoleKey.parent,
  RoleKey.tutor,
]);

@Injectable()
export class TenancyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private slugify(input: string): string {
    return input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
  }

  private assertPlatformAdmin(actor: AuthenticatedUser): void {
    if (!actor.isPlatformAdmin) {
      throw new ForbiddenException("Platform admin privileges required");
    }
  }

  private assertTenantAccess(actor: AuthenticatedUser, tenantId: string): void {
    if (actor.isPlatformAdmin) {
      return;
    }

    if (actor.activeRole !== RoleKey.school_admin || actor.activeTenantId !== tenantId) {
      throw new ForbiddenException("Not authorized for this tenant");
    }
  }

  private async assertTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });

    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }
  }

  async createInstitution(actor: AuthenticatedUser, dto: CreateInstitutionDto) {
    this.assertPlatformAdmin(actor);

    const normalizedName = dto.name.trim();
    const normalizedSlug = dto.slug ? this.slugify(dto.slug) : this.slugify(dto.name);

    if (!normalizedSlug || normalizedSlug.length < 3) {
      throw new BadRequestException("Institution slug must be at least 3 characters");
    }

    try {
      const institution = await this.prisma.tenant.create({
        data: {
          type: TenantType.institution,
          name: normalizedName,
          slug: normalizedSlug,
          status: "active",
          institutionProfile: {
            create: {
              legalName: dto.legalName,
              domain: dto.domain,
              country: dto.country,
            },
          },
        },
        include: {
          institutionProfile: true,
        },
      });

      await recordAuditEvent(this.prisma, {
        actorUserId: actor.id,
        tenantId: institution.id,
        membershipId: actor.activeMembershipId,
        contextRole: actor.activeRole,
        action: "platform.institution.create",
        entityType: "tenant",
        entityId: institution.id,
        metadataJson: {
          slug: institution.slug,
          type: institution.type,
        },
      });

      return institution;
    } catch (error) {
      if (error instanceof Error && error.message.includes("Tenant_slug_key")) {
        throw new ConflictException("Institution slug already exists");
      }
      throw error;
    }
  }

  async listInstitutions(actor: AuthenticatedUser) {
    this.assertPlatformAdmin(actor);

    return this.prisma.tenant.findMany({
      where: { type: TenantType.institution },
      include: {
        institutionProfile: true,
        _count: {
          select: {
            memberships: true,
            subjects: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async updateInstitution(actor: AuthenticatedUser, tenantId: string, dto: UpdateInstitutionDto) {
    this.assertPlatformAdmin(actor);

    const existing = await this.prisma.tenant.findFirst({
      where: { id: tenantId, type: TenantType.institution },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException("Institution tenant not found");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.update({
        where: { id: tenantId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.slug !== undefined ? { slug: this.slugify(dto.slug) } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
      });

      if (dto.legalName !== undefined || dto.domain !== undefined || dto.country !== undefined) {
        await tx.institutionProfile.upsert({
          where: { tenantId },
          create: {
            tenantId,
            legalName: dto.legalName,
            domain: dto.domain,
            country: dto.country,
          },
          update: {
            ...(dto.legalName !== undefined ? { legalName: dto.legalName } : {}),
            ...(dto.domain !== undefined ? { domain: dto.domain } : {}),
            ...(dto.country !== undefined ? { country: dto.country } : {}),
          },
        });
      }

      return tenant;
    });

    await recordAuditEvent(this.prisma, {
      actorUserId: actor.id,
      tenantId,
      membershipId: actor.activeMembershipId,
      contextRole: actor.activeRole,
      action: "platform.institution.update",
      entityType: "tenant",
      entityId: tenantId,
      metadataJson: dto,
    });

    return updated;
  }

  async addInstitutionAdmin(actor: AuthenticatedUser, tenantId: string, dto: AddInstitutionAdminDto) {
    this.assertPlatformAdmin(actor);

    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, type: TenantType.institution },
      select: { id: true },
    });

    if (!tenant) {
      throw new NotFoundException("Institution tenant not found");
    }

    const email = dto.email.toLowerCase().trim();

    const result = await this.prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({
        where: { email },
        select: { id: true, email: true, isActive: true },
      });

      if (!user) {
        if (!dto.temporaryPassword) {
          throw new BadRequestException("temporaryPassword is required for new admin user");
        }

        user = await tx.user.create({
          data: {
            email,
            passwordHash: await hashPassword(dto.temporaryPassword),
            role: RoleKey.school_admin,
            isActive: true,
          },
          select: {
            id: true,
            email: true,
            isActive: true,
          },
        });
      }

      const membership = await tx.membership.upsert({
        where: {
          userId_tenantId_role: {
            userId: user.id,
            tenantId,
            role: RoleKey.school_admin,
          },
        },
        create: {
          userId: user.id,
          tenantId,
          role: RoleKey.school_admin,
          status: MembershipStatus.active,
          invitedById: actor.id,
        },
        update: {
          status: MembershipStatus.active,
        },
      });

      await tx.user.update({
        where: { id: user.id },
        data: {
          role: RoleKey.school_admin,
          isActive: true,
        },
      });

      return {
        user,
        membership,
      };
    });

    await recordAuditEvent(this.prisma, {
      actorUserId: actor.id,
      tenantId,
      membershipId: actor.activeMembershipId,
      contextRole: actor.activeRole,
      action: "platform.institution.admin.add",
      entityType: "membership",
      entityId: result.membership.id,
      metadataJson: {
        userId: result.user.id,
        role: RoleKey.school_admin,
      },
    });

    return result;
  }

  async listMemberships(actor: AuthenticatedUser, tenantId: string) {
    this.assertTenantAccess(actor, tenantId);
    await this.assertTenantExists(tenantId);

    return this.prisma.membership.findMany({
      where: { tenantId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async createMembership(actor: AuthenticatedUser, tenantId: string, dto: CreateMembershipDto) {
    this.assertTenantAccess(actor, tenantId);
    await this.assertTenantExists(tenantId);

    if (!TENANT_ASSIGNABLE_ROLES.has(dto.role) || dto.role === RoleKey.platform_admin) {
      throw new BadRequestException("Invalid tenant role");
    }

    const email = dto.email.toLowerCase().trim();

    const result = await this.prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
        },
      });

      if (!user) {
        if (!dto.temporaryPassword) {
          throw new BadRequestException("temporaryPassword is required for new users");
        }

        user = await tx.user.create({
          data: {
            email,
            passwordHash: await hashPassword(dto.temporaryPassword),
            role: dto.role,
            isActive: true,
          },
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
          },
        });
      }

      const membership = await tx.membership.upsert({
        where: {
          userId_tenantId_role: {
            userId: user.id,
            tenantId,
            role: dto.role,
          },
        },
        create: {
          userId: user.id,
          tenantId,
          role: dto.role,
          status: MembershipStatus.active,
          invitedById: actor.id,
        },
        update: {
          status: MembershipStatus.active,
        },
      });

      if (!user.isActive) {
        await tx.user.update({
          where: { id: user.id },
          data: { isActive: true },
        });
      }

      return {
        user,
        membership,
      };
    });

    await recordAuditEvent(this.prisma, {
      actorUserId: actor.id,
      tenantId,
      membershipId: actor.activeMembershipId,
      contextRole: actor.activeRole,
      action: "tenant.membership.create",
      entityType: "membership",
      entityId: result.membership.id,
      metadataJson: {
        role: dto.role,
        userId: result.user.id,
      },
    });

    return result;
  }

  async updateMembership(
    actor: AuthenticatedUser,
    tenantId: string,
    membershipId: string,
    dto: UpdateMembershipDto,
  ) {
    this.assertTenantAccess(actor, tenantId);
    await this.assertTenantExists(tenantId);

    const membership = await this.prisma.membership.findFirst({
      where: {
        id: membershipId,
        tenantId,
      },
      select: {
        id: true,
        userId: true,
        role: true,
      },
    });

    if (!membership) {
      throw new NotFoundException("Membership not found");
    }

    if (dto.role && (!TENANT_ASSIGNABLE_ROLES.has(dto.role) || dto.role === RoleKey.platform_admin)) {
      throw new BadRequestException("Invalid tenant role");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const targetRole = dto.role ?? membership.role;

      const ensured = await tx.membership.upsert({
        where: {
          userId_tenantId_role: {
            userId: membership.userId,
            tenantId,
            role: targetRole,
          },
        },
        create: {
          userId: membership.userId,
          tenantId,
          role: targetRole,
          status: dto.status ?? MembershipStatus.active,
          invitedById: actor.id,
        },
        update: {
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
      });

      if (dto.role && dto.role !== membership.role) {
        await tx.membership.update({
          where: { id: membership.id },
          data: { status: MembershipStatus.disabled },
        });
      } else if (dto.status !== undefined) {
        await tx.membership.update({
          where: { id: membership.id },
          data: { status: dto.status },
        });
      }

      return ensured;
    });

    await recordAuditEvent(this.prisma, {
      actorUserId: actor.id,
      tenantId,
      membershipId: actor.activeMembershipId,
      contextRole: actor.activeRole,
      action: "tenant.membership.update",
      entityType: "membership",
      entityId: updated.id,
      metadataJson: dto,
    });

    return updated;
  }

  async createBillingAccount(actor: AuthenticatedUser, dto: CreateBillingAccountDto) {
    if (dto.ownerType === BillingOwnerType.tenant) {
      if (!actor.isPlatformAdmin && !(actor.activeRole === RoleKey.school_admin && actor.activeTenantId === dto.ownerId)) {
        throw new ForbiddenException("Only platform admin or owning school admin can manage tenant billing");
      }
      await this.assertTenantExists(dto.ownerId);
    }

    if (dto.ownerType === BillingOwnerType.user) {
      if (!actor.isPlatformAdmin && actor.id !== dto.ownerId) {
        throw new ForbiddenException("Cannot manage billing for another user");
      }

      const user = await this.prisma.user.findUnique({ where: { id: dto.ownerId }, select: { id: true } });
      if (!user) {
        throw new NotFoundException("User not found");
      }
    }

    const billing = await this.prisma.billingAccount.upsert({
      where: {
        ownerType_ownerId: {
          ownerType: dto.ownerType,
          ownerId: dto.ownerId,
        },
      },
      create: {
        ownerType: dto.ownerType,
        ownerId: dto.ownerId,
        tenantId: dto.ownerType === BillingOwnerType.tenant ? dto.ownerId : null,
        userId: dto.ownerType === BillingOwnerType.user ? dto.ownerId : null,
        plan: dto.plan.trim(),
        status: "active",
      },
      update: {
        plan: dto.plan.trim(),
      },
    });

    await recordAuditEvent(this.prisma, {
      actorUserId: actor.id,
      tenantId: dto.ownerType === BillingOwnerType.tenant ? dto.ownerId : actor.activeTenantId,
      membershipId: actor.activeMembershipId,
      contextRole: actor.activeRole,
      action: "billing.account.upsert",
      entityType: "billing_account",
      entityId: billing.id,
      metadataJson: {
        ownerType: dto.ownerType,
        ownerId: dto.ownerId,
        plan: dto.plan,
      },
    });

    return billing;
  }

  async createSubscription(actor: AuthenticatedUser, dto: CreateSubscriptionDto) {
    const billingAccount = await this.prisma.billingAccount.findUnique({
      where: { id: dto.billingAccountId },
      select: {
        id: true,
        ownerType: true,
        ownerId: true,
        tenantId: true,
        userId: true,
      },
    });

    if (!billingAccount) {
      throw new NotFoundException("Billing account not found");
    }

    if (billingAccount.ownerType === BillingOwnerType.tenant) {
      if (!actor.isPlatformAdmin && !(actor.activeRole === RoleKey.school_admin && actor.activeTenantId === billingAccount.ownerId)) {
        throw new ForbiddenException("Not allowed to create subscription for this tenant account");
      }
    }

    if (billingAccount.ownerType === BillingOwnerType.user) {
      if (!actor.isPlatformAdmin && actor.id !== billingAccount.ownerId) {
        throw new ForbiddenException("Not allowed to create subscription for this user account");
      }
    }

    const currentPeriodStart = new Date(dto.currentPeriodStart);
    const currentPeriodEnd = new Date(dto.currentPeriodEnd);
    if (Number.isNaN(currentPeriodStart.valueOf()) || Number.isNaN(currentPeriodEnd.valueOf())) {
      throw new BadRequestException("Invalid subscription period date");
    }
    if (currentPeriodEnd <= currentPeriodStart) {
      throw new BadRequestException("currentPeriodEnd must be after currentPeriodStart");
    }

    const subscription = await this.prisma.subscription.create({
      data: {
        billingAccountId: dto.billingAccountId,
        status: "active",
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd: dto.cancelAtPeriodEnd ?? false,
      },
    });

    await recordAuditEvent(this.prisma, {
      actorUserId: actor.id,
      tenantId: billingAccount.tenantId ?? actor.activeTenantId,
      membershipId: actor.activeMembershipId,
      contextRole: actor.activeRole,
      action: "billing.subscription.create",
      entityType: "subscription",
      entityId: subscription.id,
      metadataJson: {
        billingAccountId: dto.billingAccountId,
      },
    });

    return subscription;
  }

  async getBillingAccount(actor: AuthenticatedUser, billingAccountId: string) {
    const billingAccount = await this.prisma.billingAccount.findUnique({
      where: { id: billingAccountId },
      include: {
        subscriptions: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!billingAccount) {
      throw new NotFoundException("Billing account not found");
    }

    if (billingAccount.ownerType === BillingOwnerType.tenant) {
      if (!actor.isPlatformAdmin && !(actor.activeRole === RoleKey.school_admin && actor.activeTenantId === billingAccount.ownerId)) {
        throw new ForbiddenException("Not allowed to view this tenant billing account");
      }
    }

    if (billingAccount.ownerType === BillingOwnerType.user) {
      if (!actor.isPlatformAdmin && actor.id !== billingAccount.ownerId) {
        throw new ForbiddenException("Not allowed to view this user billing account");
      }
    }

    return billingAccount;
  }
}
