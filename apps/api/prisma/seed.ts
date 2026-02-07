import bcrypt from "bcryptjs";
import { PrismaClient, RoleKey } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";

  const hash = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash: hash, role: RoleKey.admin, isActive: true },
    create: {
      email: adminEmail,
      passwordHash: hash,
      role: RoleKey.admin,
      isActive: true,
    },
  });

  await prisma.roleLabel.upsert({
    where: { roleKey: RoleKey.admin },
    update: { displayLabel: "Admin", updatedById: admin.id },
    create: { roleKey: RoleKey.admin, displayLabel: "Admin", updatedById: admin.id },
  });

  await prisma.roleLabel.upsert({
    where: { roleKey: RoleKey.teacher },
    update: { displayLabel: "Teacher", updatedById: admin.id },
    create: { roleKey: RoleKey.teacher, displayLabel: "Teacher", updatedById: admin.id },
  });

  await prisma.roleLabel.upsert({
    where: { roleKey: RoleKey.student },
    update: { displayLabel: "Student", updatedById: admin.id },
    create: { roleKey: RoleKey.student, displayLabel: "Student", updatedById: admin.id },
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded admin user: ${adminEmail}`);
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
