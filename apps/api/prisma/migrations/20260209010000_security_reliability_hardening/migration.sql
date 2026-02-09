-- CreateEnum
CREATE TYPE "AssignmentType" AS ENUM ('practice', 'assessment');

-- AlterTable
ALTER TABLE "Assignment"
ADD COLUMN "assignmentType" "AssignmentType" NOT NULL DEFAULT 'practice',
ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN "assignmentId" TEXT;

-- Backfill existing attempts by student+exam assignment relation.
UPDATE "Attempt" AS a
SET "assignmentId" = (
  SELECT "id"
  FROM "Assignment"
  WHERE "assigneeStudentId" = a."studentId"
    AND "examId" = a."examId"
  ORDER BY "createdAt" ASC
  LIMIT 1
)
WHERE a."assignmentId" IS NULL;

-- Guard against orphan attempts before enforcing NOT NULL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Attempt"
    WHERE "assignmentId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot backfill assignmentId for existing attempts without matching assignment rows.';
  END IF;
END $$;

-- Enforce attempt-assignment linkage.
ALTER TABLE "Attempt"
ALTER COLUMN "assignmentId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

-- CreateIndex
CREATE INDEX "Attempt_assignmentId_status_idx" ON "Attempt"("assignmentId", "status");

-- AddForeignKey
ALTER TABLE "Attempt"
ADD CONSTRAINT "Attempt_assignmentId_fkey"
FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddConstraint
ALTER TABLE "Assignment"
ADD CONSTRAINT "Assignment_lessonId_or_examId_check"
CHECK ("lessonId" IS NOT NULL OR "examId" IS NOT NULL);
