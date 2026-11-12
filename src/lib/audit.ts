import "server-only";
import { prisma } from "./prisma";

export async function logAudit(params: {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}) {
  await prisma.auditLog.create({
    data: {
      actorId: params.actorId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      metadata: params.metadata ? JSON.parse(JSON.stringify(params.metadata)) : undefined,
      ip: params.ip,
    },
  });
}
