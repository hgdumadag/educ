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
import { RoleKey } from "@prisma/client";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import { RolesGuard } from "../common/guards/roles.guard.js";
import type { AuthenticatedUser } from "../common/types/authenticated-user.type.js";
import type { UploadedFile as UploadedFileType } from "../common/types/upload-file.type.js";
import { env } from "../env.js";
import { parseTabularUpload } from "./tabular.js";
import { TenantImportsService } from "./tenant-imports.service.js";

@Controller("imports")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleKey.school_admin, RoleKey.teacher, RoleKey.parent, RoleKey.tutor)
export class TenantImportsController {
  constructor(@Inject(TenantImportsService) private readonly importsService: TenantImportsService) {}

  @Post("tenant")
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
  async importTenant(
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

