# System Overview

## Architecture Style

Full-stack web application:

- `apps/web`: React + TypeScript SPA
- `apps/api`: NestJS REST API
- `PostgreSQL`: system of record
- Object storage/local volume: uploaded files

## Key Principles

- API is source of truth (not browser storage).
- Strict RBAC for every protected endpoint.
- Upload-first content ingestion with normalization.
- Deterministic grading first, LLM grading where required.
- Observability and auditability from day one.

## Reuse Strategy

- Reuse lesson/content patterns from `education-app`.
- Reuse exam session, validation, and grading flow patterns from `quiz`.
- Port all reused modules into TypeScript.

