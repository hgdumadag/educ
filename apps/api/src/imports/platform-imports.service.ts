import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  MembershipStatus,
  RoleKey,
  TenantStatus,
  TenantType,
} from "@prisma/client";

import type { AuthenticatedUser } from "../common/types/authenticated-user.type.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { recordAuditEvent } from "../utils/audit.js";
import { hashPassword } from "../utils/password.js";
import type { TabularRow } from "./tabular.js";

const DEFAULT_IMPORT_PASSWORD = "ChangeMe!23";

type ImportRowError = {
  row: number;
  message: string;
};

type PlatformImportKind = "tenants" | "tenants_school_admins";

type ImportTotals = {
  rows: number;
  createdTenants: number;
  createdUsers: number;
  createdMemberships: number;
  skipped: number;
};

type ImportResult = {
  ok: true;
  kind: PlatformImportKind;
  defaultPassword: string;
  totals: ImportTotals;
  warnings: string[];
  errors: ImportRowError[];
};

function readValue(row: TabularRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

@Injectable()
export class PlatformImportsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async run(
    actor: AuthenticatedUser,
    kindRaw: string,
    rows: TabularRow[],
    parseWarnings: string[] = [],
  ): Promise<ImportResult> {
    if (!actor.isPlatformAdmin) {
      throw new ForbiddenException("Platform admin privileges required");
    }

    const kind = kindRaw as PlatformImportKind;
    if (kind !== "tenants" && kind !== "tenants_school_admins") {
      throw new BadRequestException(`Unknown platform import kind: ${kindRaw}`);
    }

    const warnings = [...parseWarnings];
    const errors: ImportRowError[] = [];
    const totals: ImportTotals = {
      rows: rows.length,
      createdTenants: 0,
      createdUsers: 0,
      createdMemberships: 0,
      skipped: 0,
    };

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      const tenantName = readValue(rows[index], ["tenant_name", "name"]);
      const tenantSlugRaw = readValue(rows[index], ["tenant_slug", "slug"]);
      const tenantSlug = tenantSlugRaw ? slugify(tenantSlugRaw) : tenantName ? slugify(tenantName) : "";

      if (!tenantSlug || tenantSlug.length < 3) {
        errors.push({ row: rowNumber, message: "tenant_slug (or tenant_name) is required and must be at least 3 characters" });
        continue;
      }

      const domain = readValue(rows[index], ["tenant_domain", "domain"]);
      const country = readValue(rows[index], ["tenant_country", "country"]);

      const tenant = await this.getOrCreateInstitution({
        actor,
        slug: tenantSlug,
        name: tenantName || tenantSlug,
        domain: domain || undefined,
        country: country || undefined,
        totals,
      });

      if (kind === "tenants") {
        continue;
      }

      const adminEmail = normalizeEmail(readValue(rows[index], ["school_admin_email", "admin_email", "email"]));
      if (!adminEmail) {
        errors.push({ row: rowNumber, message: "school_admin_email is required" });
        continue;
      }

      const adminName = readValue(rows[index], ["school_admin_name", "admin_name", "name"]);
      const adminPassword = readValue(rows[index], ["school_admin_password", "admin_password", "password"]);

      try {
        const { createdUser, createdMembership } = await this.getOrCreateSchoolAdmin({
          actor,
          tenantId: tenant.id,
          email: adminEmail,
          displayName: adminName || undefined,
          password: adminPassword || undefined,
        });
        if (createdUser) {
          totals.createdUsers += 1;
        }
        if (createdMembership) {
          totals.createdMemberships += 1;
        }
        if (!adminPassword && createdUser) {
          warnings.push(
            `Tenant admin ${adminEmail} created with default password (${DEFAULT_IMPORT_PASSWORD}). Share it with the admin.`,
          );
        }
      } catch (error) {
        errors.push({ row: rowNumber, message: String(error) });
      }
    }

    await recordAuditEvent(this.prisma, {
      actorUserId: actor.id,
      tenantId: actor.activeTenantId,
      membershipId: actor.activeMembershipId,
      contextRole: actor.activeRole,
      action: "platform.import.run",
      entityType: "platform_import",
      metadataJson: {
        kind,
        totals,
        errorCount: errors.length,
      },
    });

    return {
      ok: true,
      kind,
      defaultPassword: DEFAULT_IMPORT_PASSWORD,
      totals,
      warnings,
      errors,
    };
  }

  private async getOrCreateInstitution(args: {
    actor: AuthenticatedUser;
    slug: string;
    name: string;
    domain?: string;
    country?: string;
    totals: ImportTotals;
  }): Promise<{ id: string; slug: string }> {
    const existing = await this.prisma.tenant.findUnique({
      where: { slug: args.slug },
      select: { id: true, slug: true, type: true, status: true },
    });
    if (existing) {
      if (existing.type !== TenantType.institution) {
        throw new BadRequestException(`Tenant slug already exists but is not an institution: ${args.slug}`);
      }
      if (existing.status !== TenantStatus.active) {
        throw new BadRequestException(`Tenant exists but is not active: ${args.slug}`);
      }
      args.totals.skipped += 1;
      return { id: existing.id, slug: existing.slug };
    }

    const created = await this.prisma.tenant.create({
      data: {
        type: TenantType.institution,
        name: args.name,
        slug: args.slug,
        status: TenantStatus.active,
        institutionProfile: {
          create: {
            legalName: args.name,
            domain: args.domain,
            country: args.country,
          },
        },
      },
      select: { id: true, slug: true },
    });

    await recordAuditEvent(this.prisma, {
      actorUserId: args.actor.id,
      tenantId: created.id,
      membershipId: args.actor.activeMembershipId,
      contextRole: args.actor.activeRole,
      action: "platform.tenant.create",
      entityType: "tenant",
      entityId: created.id,
      metadataJson: {
        slug: created.slug,
      },
    });

    args.totals.createdTenants += 1;
    return created;
  }

  private async getOrCreateSchoolAdmin(args: {
    actor: AuthenticatedUser;
    tenantId: string;
    email: string;
    displayName?: string;
    password?: string;
  }): Promise<{ createdUser: boolean; createdMembership: boolean }> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: args.email },
      select: { id: true, isActive: true, displayName: true },
    });

    if (existingUser && !existingUser.isActive) {
      throw new BadRequestException("User exists but is inactive");
    }

    let userId = existingUser?.id ?? "";
    let createdUser = false;
    if (!existingUser) {
      const passwordToUse = args.password || DEFAULT_IMPORT_PASSWORD;
      const created = await this.prisma.user.create({
        data: {
          email: args.email,
          passwordHash: await hashPassword(passwordToUse),
          role: RoleKey.school_admin,
          displayName: args.displayName ?? null,
          isActive: true,
        },
        select: { id: true },
      });
      userId = created.id;
      createdUser = true;
    } else if (args.displayName && !existingUser.displayName) {
      await this.prisma.user.update({
        where: { id: existingUser.id },
        data: { displayName: args.displayName },
      });
    }

    const existingMembership = await this.prisma.membership.findFirst({
      where: { tenantId: args.tenantId, userId, role: RoleKey.school_admin },
      select: { id: true },
    });

    await this.prisma.membership.upsert({
      where: {
        userId_tenantId_role: {
          userId,
          tenantId: args.tenantId,
          role: RoleKey.school_admin,
        },
      },
      create: {
        userId,
        tenantId: args.tenantId,
        role: RoleKey.school_admin,
        status: MembershipStatus.active,
        invitedById: args.actor.id,
      },
      update: {
        status: MembershipStatus.active,
      },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        role: RoleKey.school_admin,
        isActive: true,
      },
    });

    await recordAuditEvent(this.prisma, {
      actorUserId: args.actor.id,
      tenantId: args.tenantId,
      membershipId: args.actor.activeMembershipId,
      contextRole: args.actor.activeRole,
      action: "platform.tenant.admin.add",
      entityType: "membership",
      metadataJson: { email: args.email },
    });

    return {
      createdUser,
      createdMembership: !existingMembership,
    };
  }
}

