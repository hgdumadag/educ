# educ

Combined education platform rebuild monorepo.

## Repository Layout

```text
apps/
  api/              # NestJS API + Prisma
  web/              # React + Vite web app
packages/
  shared-types/     # Shared DTO and domain types
  exam-engine/      # Exam normalization and grading helpers
infra/
  docker/           # Dockerfiles
  nginx/            # Reverse-proxy config
platform-rebuild-docs/  # Product/architecture/API docs
```

## Quick Start

1. Copy env template:

```bash
cp .env.example .env
```

2. Install dependencies:

```bash
npm install
```

3. Start Postgres:

```bash
docker compose up -d postgres
```

4. Run Prisma migration and seed:

```bash
npm run db:migrate
npm run db:seed
```

5. Start web + api:

```bash
npm run dev
```

## Services

- Web: `http://localhost:5173`
- API: `http://localhost:3000/api`

## Production-Style Docker Stack

```bash
docker compose up --build
```

`nginx` routes `/` to web and `/api/*` to API.

## Product/Architecture Docs

Authoritative rebuild docs are in `platform-rebuild-docs/`.
