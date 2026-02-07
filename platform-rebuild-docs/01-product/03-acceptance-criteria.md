# MVP Acceptance Criteria

## Auth and Access

- Admin can create teacher/student users.
- Non-admin users cannot create users.
- Protected routes enforce role permissions server-side and client-side.

## Content and Exams

- Teacher can upload lesson package and see it listed.
- Teacher can upload exam JSON and pass validation.
- Invalid uploads return structured errors.

## Assignment and Student Flow

- Teacher can assign lessons/exams to selected students.
- Student sees only assigned items.
- Student can complete exam and receive result.

## Grading

- Multiple choice / true-false graded deterministically.
- Short/long answers graded via OpenAI through backend.
- If OpenAI fails, attempt is marked for manual review.

## Reporting

- Teacher can view submissions and export CSV.
- Admin can view system-wide metrics and basic audit events.

