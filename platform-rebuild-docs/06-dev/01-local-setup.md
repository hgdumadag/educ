# Local Setup

## Prerequisites

- Node 20+
- npm 10+
- Docker + Docker Compose

## Start

```bash
npm install
docker compose up -d postgres
npm run db:migrate
npm run dev
```

## Services

- Web: `http://localhost:5173`
- API: `http://localhost:3000`

## Seed Admin

Run seed script to create first admin account:

```bash
npm run db:seed
```

