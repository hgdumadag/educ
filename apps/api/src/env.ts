import path from "node:path";
import dotenv from "dotenv";

// Load env from API-local .env first, then repository-root .env when running via workspace scripts.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

function readEnv(name: string, fallback?: string): string {
  if (!process.env[name] && fallback) {
    process.env[name] = fallback;
  }

  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  if (Number.isNaN(value)) {
    throw new Error(`Invalid numeric value for ${name}`);
  }

  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: readNumber("PORT", 3000),
  databaseUrl: readEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/platform"),
  jwtAccessSecret: readEnv("JWT_ACCESS_SECRET", "dev_access_secret"),
  jwtRefreshSecret: readEnv("JWT_REFRESH_SECRET", "dev_refresh_secret"),
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  openAiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  uploadStorageMode: process.env.UPLOAD_STORAGE_MODE ?? "local",
  uploadLocalPath: path.resolve(process.cwd(), process.env.UPLOAD_LOCAL_PATH ?? "../../data/uploads"),
};
