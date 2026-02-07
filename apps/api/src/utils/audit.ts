import type { PrismaService } from "../prisma/prisma.service.js";

interface AuditArgs {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadataJson?: unknown;
}

export async function recordAuditEvent(prisma: PrismaService, args: AuditArgs): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      actorUserId: args.actorUserId,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      metadataJson: (args.metadataJson as object | undefined) ?? undefined,
    },
  });
}
