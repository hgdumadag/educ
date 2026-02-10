-- Create new tenancy and billing enums.
CREATE TYPE "TenantType" AS ENUM ('institution', 'individual');
CREATE TYPE "TenantStatus" AS ENUM ('active', 'suspended', 'archived');
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'invited', 'disabled');
CREATE TYPE "BillingOwnerType" AS ENUM ('tenant', 'user');
CREATE TYPE "BillingAccountStatus" AS ENUM ('active', 'trialing', 'past_due', 'canceled');
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'trialing', 'past_due', 'canceled', 'incomplete');

-- Expand RoleKey and map legacy admin -> school_admin.
ALTER TYPE "RoleKey" RENAME TO "RoleKey_old";
CREATE TYPE "RoleKey" AS ENUM ('platform_admin', 'school_admin', 'teacher', 'student', 'parent', 'tutor');
ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "RoleKey"
  USING (
    CASE
      WHEN "role"::text = 'admin' THEN 'school_admin'
      ELSE "role"::text
    END
  )::"RoleKey";
ALTER TABLE "RoleLabel"
  ALTER COLUMN "roleKey" TYPE "RoleKey"
  USING (
    CASE
      WHEN "roleKey"::text = 'admin' THEN 'school_admin'
      ELSE "roleKey"::text
    END
  )::"RoleKey";
DROP TYPE "RoleKey_old";

-- New core tenancy columns.
ALTER TABLE "User" ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Subject" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "SubjectEnrollment" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Lesson" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Exam" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Assignment" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Attempt" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "AuditEvent" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "AuditEvent" ADD COLUMN "membershipId" TEXT;
ALTER TABLE "AuditEvent" ADD COLUMN "contextRole" "RoleKey";

-- Tenancy tables.
CREATE TABLE "Tenant" (
  "id" TEXT NOT NULL,
  "type" "TenantType" NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "status" "TenantStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InstitutionProfile" (
  "tenantId" TEXT NOT NULL,
  "legalName" TEXT,
  "domain" TEXT,
  "country" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InstitutionProfile_pkey" PRIMARY KEY ("tenantId")
);

CREATE TABLE "IndividualProfile" (
  "tenantId" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "displayLabel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IndividualProfile_pkey" PRIMARY KEY ("tenantId")
);

CREATE TABLE "Membership" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "role" "RoleKey" NOT NULL,
  "status" "MembershipStatus" NOT NULL DEFAULT 'active',
  "invitedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LearnerGuardianLink" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "parentUserId" TEXT NOT NULL,
  "studentUserId" TEXT NOT NULL,
  "canAssignContent" BOOLEAN NOT NULL DEFAULT true,
  "canViewProgress" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LearnerGuardianLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingAccount" (
  "id" TEXT NOT NULL,
  "ownerType" "BillingOwnerType" NOT NULL,
  "ownerId" TEXT NOT NULL,
  "tenantId" TEXT,
  "userId" TEXT,
  "plan" TEXT NOT NULL,
  "status" "BillingAccountStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Subscription" (
  "id" TEXT NOT NULL,
  "billingAccountId" TEXT NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
  "currentPeriodStart" TIMESTAMP(3) NOT NULL,
  "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- Seed a default institution tenant and profile to backfill legacy rows.
INSERT INTO "Tenant" ("id", "type", "name", "slug", "status", "createdAt", "updatedAt")
SELECT
  'tenant_default_institution',
  'institution'::"TenantType",
  'Default Institution',
  'default-institution',
  'active'::"TenantStatus",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM "Tenant"
  WHERE "id" = 'tenant_default_institution'
    OR "slug" = 'default-institution'
);

INSERT INTO "InstitutionProfile" ("tenantId", "legalName", "createdAt", "updatedAt")
VALUES ('tenant_default_institution', 'Default Institution', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("tenantId") DO NOTHING;

-- Mark legacy admins as platform admins while preserving tenant-local admin membership.
UPDATE "User"
SET "isPlatformAdmin" = true
WHERE "role" = 'school_admin';

-- Backfill tenant ownership for existing subject/content/assignment/attempt/audit rows.
UPDATE "Subject"
SET "tenantId" = 'tenant_default_institution'
WHERE "tenantId" IS NULL;

UPDATE "SubjectEnrollment" se
SET "tenantId" = s."tenantId"
FROM "Subject" s
WHERE se."subjectId" = s."id"
  AND se."tenantId" IS NULL;

UPDATE "Lesson" l
SET "tenantId" = s."tenantId"
FROM "Subject" s
WHERE l."subjectId" = s."id"
  AND l."tenantId" IS NULL;

UPDATE "Exam" e
SET "tenantId" = s."tenantId"
FROM "Subject" s
WHERE e."subjectId" = s."id"
  AND e."tenantId" IS NULL;

UPDATE "Assignment" a
SET "tenantId" = COALESCE(
  (SELECT l."tenantId" FROM "Lesson" l WHERE l."id" = a."lessonId"),
  (SELECT e."tenantId" FROM "Exam" e WHERE e."id" = a."examId"),
  (SELECT se."tenantId" FROM "SubjectEnrollment" se WHERE se."id" = a."subjectEnrollmentId"),
  'tenant_default_institution'
)
WHERE a."tenantId" IS NULL;

UPDATE "Attempt" at
SET "tenantId" = COALESCE(
  (SELECT a."tenantId" FROM "Assignment" a WHERE a."id" = at."assignmentId"),
  'tenant_default_institution'
)
WHERE at."tenantId" IS NULL;

UPDATE "AuditEvent"
SET "tenantId" = 'tenant_default_institution'
WHERE "tenantId" IS NULL;

-- Backfill memberships from legacy user.role.
INSERT INTO "Membership" (
  "id",
  "userId",
  "tenantId",
  "role",
  "status",
  "createdAt",
  "updatedAt"
)
SELECT
  CONCAT('mem_', SUBSTRING(MD5(u."id" || ':tenant_default_institution:' || u."role"::text), 1, 24)),
  u."id",
  'tenant_default_institution',
  CASE
    WHEN u."role" = 'school_admin' THEN 'school_admin'::"RoleKey"
    WHEN u."role" = 'teacher' THEN 'teacher'::"RoleKey"
    WHEN u."role" = 'student' THEN 'student'::"RoleKey"
    WHEN u."role" = 'parent' THEN 'parent'::"RoleKey"
    WHEN u."role" = 'tutor' THEN 'tutor'::"RoleKey"
    ELSE 'student'::"RoleKey"
  END,
  'active',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
WHERE NOT EXISTS (
  SELECT 1
  FROM "Membership" m
  WHERE m."userId" = u."id"
    AND m."tenantId" = 'tenant_default_institution'
    AND m."role" = CASE
      WHEN u."role" = 'school_admin' THEN 'school_admin'::"RoleKey"
      WHEN u."role" = 'teacher' THEN 'teacher'::"RoleKey"
      WHEN u."role" = 'student' THEN 'student'::"RoleKey"
      WHEN u."role" = 'parent' THEN 'parent'::"RoleKey"
      WHEN u."role" = 'tutor' THEN 'tutor'::"RoleKey"
      ELSE 'student'::"RoleKey"
    END
);

-- Ensure role labels exist for new roles.
INSERT INTO "RoleLabel" ("roleKey", "displayLabel", "updatedAt")
VALUES
  ('platform_admin', 'Platform Admin', CURRENT_TIMESTAMP),
  ('school_admin', 'School Admin', CURRENT_TIMESTAMP),
  ('teacher', 'Teacher', CURRENT_TIMESTAMP),
  ('student', 'Student', CURRENT_TIMESTAMP),
  ('parent', 'Parent', CURRENT_TIMESTAMP),
  ('tutor', 'Tutor', CURRENT_TIMESTAMP)
ON CONFLICT ("roleKey") DO NOTHING;

-- Validate backfill completeness before making columns required.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Subject" WHERE "tenantId" IS NULL) THEN
    RAISE EXCEPTION 'Subject.tenantId backfill failed';
  END IF;

  IF EXISTS (SELECT 1 FROM "SubjectEnrollment" WHERE "tenantId" IS NULL) THEN
    RAISE EXCEPTION 'SubjectEnrollment.tenantId backfill failed';
  END IF;

  IF EXISTS (SELECT 1 FROM "Lesson" WHERE "tenantId" IS NULL) THEN
    RAISE EXCEPTION 'Lesson.tenantId backfill failed';
  END IF;

  IF EXISTS (SELECT 1 FROM "Exam" WHERE "tenantId" IS NULL) THEN
    RAISE EXCEPTION 'Exam.tenantId backfill failed';
  END IF;

  IF EXISTS (SELECT 1 FROM "Assignment" WHERE "tenantId" IS NULL) THEN
    RAISE EXCEPTION 'Assignment.tenantId backfill failed';
  END IF;

  IF EXISTS (SELECT 1 FROM "Attempt" WHERE "tenantId" IS NULL) THEN
    RAISE EXCEPTION 'Attempt.tenantId backfill failed';
  END IF;
END $$;

-- Enforce required tenant columns.
ALTER TABLE "Subject" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "SubjectEnrollment" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Lesson" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Exam" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Assignment" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Attempt" ALTER COLUMN "tenantId" SET NOT NULL;

-- Replace legacy indexes with tenant-scoped indexes.
DROP INDEX IF EXISTS "Assignment_assigneeStudentId_dueAt_idx";
DROP INDEX IF EXISTS "Assignment_subjectEnrollmentId_idx";
DROP INDEX IF EXISTS "Attempt_assignmentId_status_idx";
DROP INDEX IF EXISTS "Attempt_studentId_examId_status_idx";
DROP INDEX IF EXISTS "Exam_subjectId_createdAt_idx";
DROP INDEX IF EXISTS "Lesson_subjectId_createdAt_idx";
DROP INDEX IF EXISTS "Subject_teacherOwnerId_isArchived_createdAt_idx";
DROP INDEX IF EXISTS "Subject_teacherOwnerId_nameNormalized_key";
DROP INDEX IF EXISTS "SubjectEnrollment_studentId_status_idx";
DROP INDEX IF EXISTS "SubjectEnrollment_subjectId_status_idx";
DROP INDEX IF EXISTS "SubjectEnrollment_subjectId_studentId_key";

CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");
CREATE INDEX "Tenant_type_status_createdAt_idx" ON "Tenant"("type", "status", "createdAt");
CREATE INDEX "IndividualProfile_ownerUserId_idx" ON "IndividualProfile"("ownerUserId");
CREATE INDEX "Membership_tenantId_role_status_idx" ON "Membership"("tenantId", "role", "status");
CREATE INDEX "Membership_userId_status_idx" ON "Membership"("userId", "status");
CREATE INDEX "Membership_tenantId_userId_idx" ON "Membership"("tenantId", "userId");
CREATE UNIQUE INDEX "Membership_userId_tenantId_role_key" ON "Membership"("userId", "tenantId", "role");
CREATE INDEX "LearnerGuardianLink_tenantId_parentUserId_idx" ON "LearnerGuardianLink"("tenantId", "parentUserId");
CREATE INDEX "LearnerGuardianLink_tenantId_studentUserId_idx" ON "LearnerGuardianLink"("tenantId", "studentUserId");
CREATE UNIQUE INDEX "LearnerGuardianLink_tenantId_parentUserId_studentUserId_key" ON "LearnerGuardianLink"("tenantId", "parentUserId", "studentUserId");
CREATE INDEX "BillingAccount_tenantId_status_idx" ON "BillingAccount"("tenantId", "status");
CREATE INDEX "BillingAccount_userId_status_idx" ON "BillingAccount"("userId", "status");
CREATE UNIQUE INDEX "BillingAccount_ownerType_ownerId_key" ON "BillingAccount"("ownerType", "ownerId");
CREATE INDEX "Subscription_billingAccountId_status_idx" ON "Subscription"("billingAccountId", "status");
CREATE INDEX "Assignment_tenantId_assigneeStudentId_dueAt_idx" ON "Assignment"("tenantId", "assigneeStudentId", "dueAt");
CREATE INDEX "Assignment_tenantId_subjectEnrollmentId_idx" ON "Assignment"("tenantId", "subjectEnrollmentId");
CREATE INDEX "Attempt_tenantId_studentId_examId_status_idx" ON "Attempt"("tenantId", "studentId", "examId", "status");
CREATE INDEX "Attempt_tenantId_assignmentId_status_idx" ON "Attempt"("tenantId", "assignmentId", "status");
CREATE INDEX "AuditEvent_tenantId_createdAt_idx" ON "AuditEvent"("tenantId", "createdAt");
CREATE INDEX "Exam_tenantId_subjectId_createdAt_idx" ON "Exam"("tenantId", "subjectId", "createdAt");
CREATE INDEX "Lesson_tenantId_subjectId_createdAt_idx" ON "Lesson"("tenantId", "subjectId", "createdAt");
CREATE INDEX "Subject_tenantId_teacherOwnerId_isArchived_createdAt_idx" ON "Subject"("tenantId", "teacherOwnerId", "isArchived", "createdAt");
CREATE UNIQUE INDEX "Subject_tenantId_teacherOwnerId_nameNormalized_key" ON "Subject"("tenantId", "teacherOwnerId", "nameNormalized");
CREATE INDEX "SubjectEnrollment_tenantId_subjectId_status_idx" ON "SubjectEnrollment"("tenantId", "subjectId", "status");
CREATE INDEX "SubjectEnrollment_tenantId_studentId_status_idx" ON "SubjectEnrollment"("tenantId", "studentId", "status");
CREATE UNIQUE INDEX "SubjectEnrollment_tenantId_subjectId_studentId_key" ON "SubjectEnrollment"("tenantId", "subjectId", "studentId");
CREATE INDEX "User_isPlatformAdmin_isActive_idx" ON "User"("isPlatformAdmin", "isActive");

-- Foreign keys.
ALTER TABLE "InstitutionProfile"
  ADD CONSTRAINT "InstitutionProfile_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IndividualProfile"
  ADD CONSTRAINT "IndividualProfile_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IndividualProfile"
  ADD CONSTRAINT "IndividualProfile_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Membership"
  ADD CONSTRAINT "Membership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Membership"
  ADD CONSTRAINT "Membership_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Membership"
  ADD CONSTRAINT "Membership_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Subject"
  ADD CONSTRAINT "Subject_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubjectEnrollment"
  ADD CONSTRAINT "SubjectEnrollment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Lesson"
  ADD CONSTRAINT "Lesson_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Exam"
  ADD CONSTRAINT "Exam_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Assignment"
  ADD CONSTRAINT "Assignment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Attempt"
  ADD CONSTRAINT "Attempt_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditEvent"
  ADD CONSTRAINT "AuditEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuditEvent"
  ADD CONSTRAINT "AuditEvent_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LearnerGuardianLink"
  ADD CONSTRAINT "LearnerGuardianLink_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearnerGuardianLink"
  ADD CONSTRAINT "LearnerGuardianLink_parentUserId_fkey"
  FOREIGN KEY ("parentUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LearnerGuardianLink"
  ADD CONSTRAINT "LearnerGuardianLink_studentUserId_fkey"
  FOREIGN KEY ("studentUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BillingAccount"
  ADD CONSTRAINT "BillingAccount_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BillingAccount"
  ADD CONSTRAINT "BillingAccount_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_billingAccountId_fkey"
  FOREIGN KEY ("billingAccountId") REFERENCES "BillingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
