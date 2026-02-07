# Exam API (v1)

## `POST /api/exams/upload` (teacher/admin)

Upload exam JSON.
Pipeline:

1. Parse
2. Validate schema
3. Normalize to internal exam format
4. Persist

## `POST /api/assignments` (teacher/admin)

Assign lesson/exam to one or many students.

## `GET /api/assignments/my` (student)

Return assigned lessons/exams.

## `POST /api/attempts` (student)

Create attempt for exam.

## `PATCH /api/attempts/:attemptId/responses` (student)

Autosave response payload.

## `POST /api/attempts/:attemptId/submit` (student)

Runs grading pipeline:

- objective grading
- OpenAI grading for short/long answers
- fallback to `needs_review` on LLM failure

## `GET /api/attempts/:attemptId/result`

Role-aware result retrieval.

