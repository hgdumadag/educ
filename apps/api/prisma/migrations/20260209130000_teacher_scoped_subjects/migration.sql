-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('active', 'completed');

-- CreateEnum
CREATE TYPE "AssignmentSource" AS ENUM ('manual', 'subject_auto');

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "teacherOwnerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectEnrollment" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'active',
    "autoAssignFuture" BOOLEAN NOT NULL DEFAULT true,
    "enrolledByUserId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubjectEnrollment_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN "subjectId" TEXT;

-- AlterTable
ALTER TABLE "Exam" ADD COLUMN "subjectId" TEXT;

-- AlterTable
ALTER TABLE "Assignment"
ADD COLUMN "assignmentSource" "AssignmentSource" NOT NULL DEFAULT 'manual',
ADD COLUMN "subjectEnrollmentId" TEXT;

-- Ensure at least one teacher exists as fallback ownership target for legacy content.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "User" WHERE "role" = 'teacher'
  ) THEN
    INSERT INTO "User" ("id", "email", "passwordHash", "role", "isActive", "createdAt", "updatedAt")
    VALUES (
      'legacy_teacher_owner',
      'legacy.teacher@local.invalid',
      '$2b$10$WfLIYwPjUH7D6lIqux6H9OHB8nGK0q7FpC18m0tHbdDg14Q6gttY6',
      'teacher',
      false,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("email") DO NOTHING;
  END IF;
END $$;

-- Backfill subjects from legacy lesson/exam string subjects grouped by resolved teacher owner.
WITH content_sources AS (
  SELECT DISTINCT
    COALESCE(
      CASE
        WHEN uploader."role" = 'teacher' THEN l."uploadedById"
        ELSE NULL
      END,
      (
        SELECT a."assignedByTeacherId"
        FROM "Assignment" a
        JOIN "User" teacher ON teacher."id" = a."assignedByTeacherId"
        WHERE a."lessonId" = l."id"
          AND teacher."role" = 'teacher'
        ORDER BY a."createdAt" ASC
        LIMIT 1
      ),
      (
        SELECT t."id"
        FROM "User" t
        WHERE t."role" = 'teacher'
        ORDER BY t."createdAt" ASC
        LIMIT 1
      )
    ) AS teacher_owner_id,
    COALESCE(NULLIF(BTRIM(l."subject"), ''), 'General') AS subject_name
  FROM "Lesson" l
  JOIN "User" uploader ON uploader."id" = l."uploadedById"

  UNION

  SELECT DISTINCT
    COALESCE(
      CASE
        WHEN uploader."role" = 'teacher' THEN e."uploadedById"
        ELSE NULL
      END,
      (
        SELECT a."assignedByTeacherId"
        FROM "Assignment" a
        JOIN "User" teacher ON teacher."id" = a."assignedByTeacherId"
        WHERE a."examId" = e."id"
          AND teacher."role" = 'teacher'
        ORDER BY a."createdAt" ASC
        LIMIT 1
      ),
      (
        SELECT t."id"
        FROM "User" t
        WHERE t."role" = 'teacher'
        ORDER BY t."createdAt" ASC
        LIMIT 1
      )
    ) AS teacher_owner_id,
    COALESCE(NULLIF(BTRIM(e."subject"), ''), 'General') AS subject_name
  FROM "Exam" e
  JOIN "User" uploader ON uploader."id" = e."uploadedById"
), normalized_sources AS (
  SELECT DISTINCT
    teacher_owner_id,
    subject_name,
    LOWER(subject_name) AS subject_name_normalized
  FROM content_sources
  WHERE teacher_owner_id IS NOT NULL
)
INSERT INTO "Subject" (
  "id",
  "teacherOwnerId",
  "name",
  "nameNormalized",
  "isArchived",
  "createdAt",
  "updatedAt"
)
SELECT
  CONCAT('sub_', SUBSTRING(MD5(RANDOM()::text || CLOCK_TIMESTAMP()::text), 1, 24)),
  source.teacher_owner_id,
  source.subject_name,
  source.subject_name_normalized,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM normalized_sources source;

-- Backfill lesson subject foreign keys.
UPDATE "Lesson" AS l
SET "subjectId" = (
  SELECT s."id"
  FROM "Subject" s
  WHERE s."teacherOwnerId" = COALESCE(
      (
        SELECT CASE
          WHEN uploader."role" = 'teacher' THEN l."uploadedById"
          ELSE NULL
        END
        FROM "User" uploader
        WHERE uploader."id" = l."uploadedById"
      ),
      (
        SELECT a."assignedByTeacherId"
        FROM "Assignment" a
        JOIN "User" teacher ON teacher."id" = a."assignedByTeacherId"
        WHERE a."lessonId" = l."id"
          AND teacher."role" = 'teacher'
        ORDER BY a."createdAt" ASC
        LIMIT 1
      ),
      (
        SELECT t."id"
        FROM "User" t
        WHERE t."role" = 'teacher'
        ORDER BY t."createdAt" ASC
        LIMIT 1
      )
    )
    AND s."nameNormalized" = LOWER(COALESCE(NULLIF(BTRIM(l."subject"), ''), 'General'))
  ORDER BY s."createdAt" ASC
  LIMIT 1
)
WHERE l."subjectId" IS NULL;

-- Backfill exam subject foreign keys.
UPDATE "Exam" AS e
SET "subjectId" = (
  SELECT s."id"
  FROM "Subject" s
  WHERE s."teacherOwnerId" = COALESCE(
      (
        SELECT CASE
          WHEN uploader."role" = 'teacher' THEN e."uploadedById"
          ELSE NULL
        END
        FROM "User" uploader
        WHERE uploader."id" = e."uploadedById"
      ),
      (
        SELECT a."assignedByTeacherId"
        FROM "Assignment" a
        JOIN "User" teacher ON teacher."id" = a."assignedByTeacherId"
        WHERE a."examId" = e."id"
          AND teacher."role" = 'teacher'
        ORDER BY a."createdAt" ASC
        LIMIT 1
      ),
      (
        SELECT t."id"
        FROM "User" t
        WHERE t."role" = 'teacher'
        ORDER BY t."createdAt" ASC
        LIMIT 1
      )
    )
    AND s."nameNormalized" = LOWER(COALESCE(NULLIF(BTRIM(e."subject"), ''), 'General'))
  ORDER BY s."createdAt" ASC
  LIMIT 1
)
WHERE e."subjectId" IS NULL;

-- Guard against missing subject foreign keys.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Lesson" WHERE "subjectId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot backfill Lesson.subjectId for all rows.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Exam" WHERE "subjectId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot backfill Exam.subjectId for all rows.';
  END IF;
END $$;

-- Enforce non-null for new subject references.
ALTER TABLE "Lesson" ALTER COLUMN "subjectId" SET NOT NULL;
ALTER TABLE "Exam" ALTER COLUMN "subjectId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Subject_teacherOwnerId_nameNormalized_key" ON "Subject"("teacherOwnerId", "nameNormalized");

-- CreateIndex
CREATE INDEX "Subject_teacherOwnerId_isArchived_createdAt_idx" ON "Subject"("teacherOwnerId", "isArchived", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectEnrollment_subjectId_studentId_key" ON "SubjectEnrollment"("subjectId", "studentId");

-- CreateIndex
CREATE INDEX "SubjectEnrollment_subjectId_status_idx" ON "SubjectEnrollment"("subjectId", "status");

-- CreateIndex
CREATE INDEX "SubjectEnrollment_studentId_status_idx" ON "SubjectEnrollment"("studentId", "status");

-- CreateIndex
CREATE INDEX "Lesson_subjectId_createdAt_idx" ON "Lesson"("subjectId", "createdAt");

-- CreateIndex
CREATE INDEX "Exam_subjectId_createdAt_idx" ON "Exam"("subjectId", "createdAt");

-- CreateIndex
CREATE INDEX "Assignment_subjectEnrollmentId_idx" ON "Assignment"("subjectEnrollmentId");

-- Add idempotency indexes for subject auto-assignment.
CREATE UNIQUE INDEX "Assignment_subjectAuto_lesson_unique_idx"
ON "Assignment"("subjectEnrollmentId", "lessonId")
WHERE "assignmentSource" = 'subject_auto' AND "lessonId" IS NOT NULL;

CREATE UNIQUE INDEX "Assignment_subjectAuto_exam_unique_idx"
ON "Assignment"("subjectEnrollmentId", "examId")
WHERE "assignmentSource" = 'subject_auto' AND "examId" IS NOT NULL;

-- AddCheckConstraint
ALTER TABLE "Assignment"
ADD CONSTRAINT "Assignment_source_subjectEnrollment_check"
CHECK (
  "assignmentSource" <> 'subject_auto'
  OR "subjectEnrollmentId" IS NOT NULL
);

-- AddForeignKey
ALTER TABLE "Subject"
ADD CONSTRAINT "Subject_teacherOwnerId_fkey"
FOREIGN KEY ("teacherOwnerId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectEnrollment"
ADD CONSTRAINT "SubjectEnrollment_subjectId_fkey"
FOREIGN KEY ("subjectId") REFERENCES "Subject"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectEnrollment"
ADD CONSTRAINT "SubjectEnrollment_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectEnrollment"
ADD CONSTRAINT "SubjectEnrollment_enrolledByUserId_fkey"
FOREIGN KEY ("enrolledByUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectEnrollment"
ADD CONSTRAINT "SubjectEnrollment_completedByUserId_fkey"
FOREIGN KEY ("completedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson"
ADD CONSTRAINT "Lesson_subjectId_fkey"
FOREIGN KEY ("subjectId") REFERENCES "Subject"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam"
ADD CONSTRAINT "Exam_subjectId_fkey"
FOREIGN KEY ("subjectId") REFERENCES "Subject"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment"
ADD CONSTRAINT "Assignment_subjectEnrollmentId_fkey"
FOREIGN KEY ("subjectEnrollmentId") REFERENCES "SubjectEnrollment"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
