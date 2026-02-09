import "reflect-metadata";
import { performance } from "node:perf_hooks";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import type { NextFunction, Request, Response } from "express";

import { AppModule } from "./app.module.js";
import { MulterExceptionFilter } from "./common/filters/multer-exception.filter.js";
import { PrismaExceptionFilter } from "./common/filters/prisma-exception.filter.js";
import { csrfMiddleware } from "./common/middleware/csrf.middleware.js";
import { env } from "./env.js";
import { ObservabilityService } from "./observability/observability.service.js";

function normalizeMetricsPath(path: string): string {
  return path
    .replace(/[a-z0-9]{20,}/gi, ":id")
    .replace(/\/\d+/g, "/:id");
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const observability = app.get(ObservabilityService);

  app.getHttpAdapter().getInstance().set("trust proxy", 1);
  app.setGlobalPrefix("api");

  app.use(cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

    if (env.isProduction) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    next();
  });
  app.use(csrfMiddleware);

  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = performance.now();
    res.on("finish", () => {
      observability.recordHttpRequest({
        method: req.method,
        path: normalizeMetricsPath((req.originalUrl.split("?")[0] ?? req.originalUrl) || "/"),
        statusCode: res.statusCode,
        latencyMs: performance.now() - start,
      });
    });
    next();
  });

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (env.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed by CORS"), false);
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new PrismaExceptionFilter(), new MulterExceptionFilter());

  await app.listen(env.port);
}

bootstrap();
