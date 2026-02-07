# MVP Scope

## Goal

Deliver a production-ready web platform where:

- Admins create users and manage system settings.
- Teachers upload lessons and exams, assign work, and review results.
- Students access assigned lessons/exams and submit answers.

## Included

- Auth + RBAC for `admin`, `teacher`, `student`
- Admin-created accounts only
- Lesson upload (ZIP/JSON/Markdown-based)
- Exam upload (JSON-based)
- Assignment workflow (teacher -> student)
- Exam taking (timed/untimed), autosave, submit
- Objective grading + OpenAI grading for short/long answers
- Results view and CSV export
- Role display labels (editable UI text per role)

## Not Included

- Open self-registration
- In-app visual lesson/exam editor
- Multi-tenant organizations
- Legacy migration from existing apps
- Payment/subscription features

