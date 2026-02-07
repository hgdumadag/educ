# Deployment Blueprint

## Hosting Constraint

Target providers: Bluehost, GoDaddy, Hostinger.
Recommended approach: VPS plan with Docker.

## Containers

- `nginx` reverse proxy + static web hosting
- `web` React production build
- `api` NestJS service
- `postgres` database

## Networking

- HTTPS required
- `nginx` routes:
  - `/` -> web
  - `/api/*` -> api

## Persistence

- Postgres volume for DB
- Uploads volume or S3-compatible storage bucket

## Secrets

- OpenAI key and JWT secrets in environment variables only
- Never expose OpenAI key to browser

