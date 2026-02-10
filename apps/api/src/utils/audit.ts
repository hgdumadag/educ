import type { RoleKey } from "@prisma/client";

import type { PrismaService } from "../prisma/prisma.service.js";

interface AuditArgs {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadataJson?: unknown;
  tenantId?: string;
  membershipId?: string;
  contextRole?: RoleKey;
}

export async function recordAuditEvent(prisma: PrismaService, args: AuditArgs): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      actorUserId: args.actorUserId,
      tenantId: args.tenantId,
      membershipId: args.membershipId,
      contextRole: args.contextRole,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      metadataJson: (args.metadataJson as object | undefined) ?? undefined,
    },
  });
}
