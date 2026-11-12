import "server-only";
import { randomBytes, createHash, createHmac, timingSafeEqual } from "crypto";
import { prisma } from "../prisma";

const LINK_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours

function secret(): string {
  const s = process.env.APPROVAL_LINK_SECRET;
  if (!s) throw new Error("APPROVAL_LINK_SECRET is not configured");
  return s;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Builds a signed, single-use, expiring token for a one-tap approve/reject
 * link. The raw token is only ever sent to the approver (email/Telegram);
 * the database stores only its hash, so leaking the DB does not leak usable
 * tokens. An HMAC signature over (requestId, approverId, action, expiry) is
 * embedded so the token is self-verifying even before the DB lookup, which
 * also makes it resistant to being forwarded for a different action.
 */
export async function createApprovalLinkToken(params: {
  leaveRequestId: string;
  approverId: string;
  action: "APPROVE" | "REJECT";
}): Promise<string> {
  const random = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + LINK_TTL_MS);
  const payload = `${random}.${params.leaveRequestId}.${params.approverId}.${params.action}.${expiresAt.getTime()}`;
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  const token = `${payload}.${signature}`;

  await prisma.approvalLinkToken.create({
    data: {
      tokenHash: hashToken(token),
      leaveRequestId: params.leaveRequestId,
      approverId: params.approverId,
      action: params.action,
      expiresAt,
    },
  });

  return token;
}

export interface ApprovalLinkVerification {
  ok: boolean;
  reason?: "MALFORMED" | "BAD_SIGNATURE" | "NOT_FOUND" | "EXPIRED" | "ALREADY_USED";
  leaveRequestId?: string;
  approverId?: string;
  action?: "APPROVE" | "REJECT";
}

/** Verifies and atomically consumes a one-tap approval token. Safe to call once per click. */
export async function consumeApprovalLinkToken(token: string): Promise<ApprovalLinkVerification> {
  const parts = token.split(".");
  if (parts.length !== 6) return { ok: false, reason: "MALFORMED" };
  const [random, leaveRequestId, approverId, action, expiresAtMs, signature] = parts;

  const payload = `${random}.${leaveRequestId}.${approverId}.${action}.${expiresAtMs}`;
  const expectedSignature = createHmac("sha256", secret()).update(payload).digest("base64url");
  if (!safeEqual(signature, expectedSignature)) return { ok: false, reason: "BAD_SIGNATURE" };

  const record = await prisma.approvalLinkToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record) return { ok: false, reason: "NOT_FOUND" };
  if (record.usedAt) return { ok: false, reason: "ALREADY_USED" };
  if (record.expiresAt.getTime() < Date.now()) return { ok: false, reason: "EXPIRED" };

  // Atomic single-use consumption: only succeeds if usedAt is still null.
  const result = await prisma.approvalLinkToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (result.count === 0) return { ok: false, reason: "ALREADY_USED" };

  return {
    ok: true,
    leaveRequestId: record.leaveRequestId,
    approverId: record.approverId,
    action: record.action as "APPROVE" | "REJECT",
  };
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
