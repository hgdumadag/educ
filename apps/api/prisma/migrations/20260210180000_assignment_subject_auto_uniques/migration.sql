-- Ensure subject auto-assignment is idempotent (upload retries / concurrent enrollment actions).
-- Prisma cannot express partial unique indexes, so we add them via raw SQL.

CREATE UNIQUE INDEX IF NOT EXISTS "Assignment_subjectAuto_subjectEnrollmentId_lessonId_key"
ON "Assignment" ("subjectEnrollmentId", "lessonId")
WHERE "assignmentSource" = 'subject_auto'
  AND "subjectEnrollmentId" IS NOT NULL
  AND "lessonId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Assignment_subjectAuto_subjectEnrollmentId_examId_key"
ON "Assignment" ("subjectEnrollmentId", "examId")
WHERE "assignmentSource" = 'subject_auto'
  AND "subjectEnrollmentId" IS NOT NULL
  AND "examId" IS NOT NULL;

