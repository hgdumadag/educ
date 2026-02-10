import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { PrismaClient, RoleKey, TenantType } from "@prisma/client";
import path from "node:path";

const prisma = new PrismaClient();

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

async function main(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";
  const institutionName = process.env.DEFAULT_INSTITUTION_NAME ?? "Default Institution";
  const institutionSlug = process.env.DEFAULT_INSTITUTION_SLUG ?? slugify(institutionName);

  const hash = await bcrypt.hash(adminPassword, 10);

  const tenant = await prisma.tenant.upsert({
    where: { slug: institutionSlug },
    update: {
      name: institutionName,
      type: TenantType.institution,
      status: "active",
    },
    create: {
      type: TenantType.institution,
      name: institutionName,
      slug: institutionSlug,
      status: "active",
      institutionProfile: {
        create: {
          legalName: institutionName,
        },
      },
    },
  });

  await prisma.institutionProfile.upsert({
    where: { tenantId: tenant.id },
    update: {
      legalName: institutionName,
    },
    create: {
      tenantId: tenant.id,
      legalName: institutionName,
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash: hash,
      role: RoleKey.school_admin,
      isPlatformAdmin: true,
      isActive: true,
    },
    create: {
      email: adminEmail,
      passwordHash: hash,
      role: RoleKey.school_admin,
      isPlatformAdmin: true,
      isActive: true,
    },
  });

  await prisma.membership.upsert({
    where: {
      userId_tenantId_role: {
        userId: admin.id,
        tenantId: tenant.id,
        role: RoleKey.school_admin,
      },
    },
    update: {
      status: "active",
    },
    create: {
      userId: admin.id,
      tenantId: tenant.id,
      role: RoleKey.school_admin,
      status: "active",
      invitedById: admin.id,
    },
  });

  const labels: Array<{ roleKey: RoleKey; displayLabel: string }> = [
    { roleKey: RoleKey.platform_admin, displayLabel: "Platform Admin" },
    { roleKey: RoleKey.school_admin, displayLabel: "School Admin" },
    { roleKey: RoleKey.teacher, displayLabel: "Teacher" },
    { roleKey: RoleKey.student, displayLabel: "Student" },
    { roleKey: RoleKey.parent, displayLabel: "Parent" },
    { roleKey: RoleKey.tutor, displayLabel: "Tutor" },
  ];

  for (const label of labels) {
    await prisma.roleLabel.upsert({
      where: { roleKey: label.roleKey },
      update: { displayLabel: label.displayLabel, updatedById: admin.id },
      create: { roleKey: label.roleKey, displayLabel: label.displayLabel, updatedById: admin.id },
    });
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded school admin user: ${adminEmail} in tenant ${tenant.slug}`);
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
