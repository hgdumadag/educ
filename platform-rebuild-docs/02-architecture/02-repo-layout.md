# Repo Layout

```text
/
  apps/
    web/                # React app
    api/                # NestJS app
  packages/
    shared-types/       # DTOs, shared enums, validation types
    exam-engine/        # Question grading/session utilities
  platform-rebuild-docs/
  infra/
    docker/
    nginx/
```

## Ownership

- Web team: `apps/web`
- API team: `apps/api`
- Shared logic team: `packages/*`

## Rules

- No direct DB access from `apps/web`.
- Shared logic cannot import app-specific modules.
- All external API contracts live in `apps/api` and are mirrored in `packages/shared-types`.

