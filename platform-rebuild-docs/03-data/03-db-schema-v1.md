# DB Schema v1 (High-Level)

## Tables

- `users`
- `role_labels`
- `lessons`
- `exams`
- `assignments`
- `attempts`
- `responses`
- `audit_events`

## Required Indexes

- `users(role, is_active)`
- `assignments(assignee_student_id, due_at)`
- `attempts(student_id, exam_id, status)`
- `responses(attempt_id, question_id)` unique
- `audit_events(actor_user_id, created_at)`

## Constraints

- `assignments` must reference at least one of `lesson_id` or `exam_id`
- `responses` unique by `(attempt_id, question_id)`
- `role_labels.role_key` unique

## Migrations

- Use Prisma migrations only.
- Never mutate production schema manually.

