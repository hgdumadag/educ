# Next Development Checklist

> **Instruction:** Every checklist item below must be **checked off** once the activity is completed.

## Product & UX
- [ ] Teacher UI: create assignment flow (choose lesson/exam, student selection, due date).
- [ ] Student UI: exam-taking flow (question rendering, autosave, submit).
- [ ] Student UI: results view (score, feedback, needs-review banner).
- [ ] Admin UI: audit log viewer and CSV export trigger.

## API & Business Logic
- [x] Prevent duplicate in-progress attempts per student/exam.
- [x] Validate response question IDs against the exam schema before saving.
- [x] Enforce due dates on attempt creation/submission.
- [ ] Add pagination to admin reports and audit logs.

## Security & Reliability
- [ ] Restrict CORS origins to an allowlist (no `origin: true` with credentials).
- [ ] Add upload size/type limits and zip safety checks.
- [ ] Add rate limiting for auth and upload endpoints.
- [ ] Move refresh token storage away from `localStorage`.

## Observability & Operations
- [ ] Add structured request logging (request ID, actor ID, endpoint, latency).
- [ ] Add health checks for API + DB connectivity.
- [ ] Document runbook for local dev + production deploy.
