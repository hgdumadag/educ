import path from "node:path";
import dotenv from "dotenv";

// Load env from API-local .env first, then repository-root .env when running via workspace scripts.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

type CookieSameSite = "lax" | "strict" | "none";

function readEnv(name: string, fallback?: string): string {
  const raw = process.env[name];
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error(`Missing required environment variable: ${name}`);
}

function readOptionalEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (typeof raw !== "string") {
    return undefined;
  }

  const value = raw.trim();
  return value ? value : undefined;
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

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "0") {
    return false;
  }

  throw new Error(`Invalid boolean value for ${name}`);
}

function readCsv(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const values = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return values.length > 0 ? values : fallback;
}

function readCookieSameSite(name: string, fallback: CookieSameSite): CookieSameSite {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === "lax" || normalized === "strict" || normalized === "none") {
    return normalized;
  }

  throw new Error(`Invalid same-site value for ${name}`);
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: (process.env.NODE_ENV ?? "development") === "production",
  port: readNumber("PORT", 3000),
  databaseUrl: readEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/platform"),
  jwtAccessSecret: readEnv("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: readEnv("JWT_REFRESH_SECRET"),
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  openAiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  uploadStorageMode: process.env.UPLOAD_STORAGE_MODE ?? "local",
  uploadLocalPath: path.resolve(process.cwd(), process.env.UPLOAD_LOCAL_PATH ?? "../../data/uploads"),
  uploadMaxLessonZipBytes: readNumber("UPLOAD_MAX_LESSON_ZIP_BYTES", 10 * 1024 * 1024),
  uploadMaxExamJsonBytes: readNumber("UPLOAD_MAX_EXAM_JSON_BYTES", 2 * 1024 * 1024),
  importMaxTabularBytes: readNumber("IMPORT_MAX_TABULAR_BYTES", 5 * 1024 * 1024),
  corsOrigins: readCsv("CORS_ORIGINS", [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
  ]),
  cookieSecure: readBoolean("COOKIE_SECURE", (process.env.NODE_ENV ?? "development") === "production"),
  cookieDomain: readOptionalEnv("COOKIE_DOMAIN"),
  cookieSameSite: readCookieSameSite("COOKIE_SAME_SITE", "lax"),
  redisUrl: readEnv("REDIS_URL", "redis://localhost:6379"),
  authMaxFailedLogins: readNumber("AUTH_MAX_FAILED_LOGINS", 5),
  authFailedWindowSeconds: readNumber("AUTH_FAILED_WINDOW_SECONDS", 300),
  authLockoutSeconds: readNumber("AUTH_LOCKOUT_SECONDS", 900),
};
