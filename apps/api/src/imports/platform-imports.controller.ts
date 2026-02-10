import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import type { AuthenticatedUser } from "../common/types/authenticated-user.type.js";
import type { UploadedFile as UploadedFileType } from "../common/types/upload-file.type.js";
import { env } from "../env.js";
import { parseTabularUpload } from "./tabular.js";
import { PlatformImportsService } from "./platform-imports.service.js";

@Controller("platform/imports")
@UseGuards(JwtAuthGuard)
export class PlatformImportsController {
  constructor(@Inject(PlatformImportsService) private readonly importsService: PlatformImportsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: env.importMaxTabularBytes },
      fileFilter: (_req, file, callback) => {
        const name = file.originalname.toLowerCase();
        const ok = name.endsWith(".csv") || name.endsWith(".xlsx") || name.endsWith(".xls");
        if (!ok) {
          callback(new BadRequestException("Only CSV or Excel (.xlsx) files are accepted"), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  async importPlatform(
    @CurrentUser() actor: AuthenticatedUser,
    @Body("kind") kind: string,
    @UploadedFile() file?: UploadedFileType,
  ) {
    if (!file) {
      throw new BadRequestException("Missing upload file");
    }

    if (!kind || !kind.trim()) {
      throw new BadRequestException("kind is required");
    }

    const parsed = parseTabularUpload(file);
    if (parsed.rows.length === 0) {
      throw new BadRequestException(parsed.warnings[0] ?? "No rows found in import file");
    }

    return this.importsService.run(actor, kind.trim(), parsed.rows, parsed.warnings);
  }
}

