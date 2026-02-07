# Start Here

This project rebuilds and combines:

- `education-app` strengths: lesson/content browsing and upload workflow
- `quiz` strengths: exam engine, validation, timed sessions, grading, reporting

## Fixed Product Decisions

- Public browser access
- Admin-created users only
- Roles: `admin`, `teacher`, `student`
- Role labels are editable for UI display
- MVP includes OpenAI grading
- Teacher workflow in MVP is upload-first (JSON/ZIP)
- No data migration from old apps

## Recommended Stack

- Web: React + TypeScript + Vite
- API: NestJS + TypeScript
- DB: PostgreSQL + Prisma
- Auth: JWT access + refresh tokens
- File storage: local volume first, S3-compatible later

## Build Order

1. Auth + RBAC
2. Content/exam upload and normalization
3. Assignment and exam-taking APIs
4. Web integration for student and teacher flows
5. OpenAI grading and results export

