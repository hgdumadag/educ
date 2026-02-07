# Core Models

## User

- `id`
- `email` (or username)
- `passwordHash`
- `role` (`admin|teacher|student`)
- `isActive`
- timestamps

## RoleLabel

- `roleKey` (`admin|teacher|student`)
- `displayLabel`
- `updatedBy`

## Lesson

- `id`
- `title`
- `gradeLevel` (optional)
- `subject`
- `contentPath`
- `metadataJson`
- `uploadedBy`

## Exam

- `id`
- `title`
- `subject`
- `settingsJson`
- `normalizedSchemaVersion`
- `uploadedBy`

## Assignment

- `id`
- `assigneeStudentId`
- `assignedByTeacherId`
- `lessonId` (nullable)
- `examId` (nullable)
- `dueAt` (nullable)

## Attempt

- `id`
- `examId`
- `studentId`
- `status` (`in_progress|submitted|graded|needs_review`)
- `startedAt`, `submittedAt`
- `scorePercent`
- `gradingSummaryJson`

## Response

- `id`
- `attemptId`
- `questionId`
- `answerJson`
- `gradingJson`

