FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/exam-engine/package.json packages/exam-engine/package.json

RUN npm install

COPY . .

RUN npm run build --workspace @educ/shared-types \
  && npm run build --workspace @educ/exam-engine \
  && npx prisma generate --schema apps/api/prisma/schema.prisma \
  && npm run build --workspace @educ/api

FROM node:20-alpine AS runtime
WORKDIR /app

COPY --from=builder /app /app

EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "@educ/api"]
