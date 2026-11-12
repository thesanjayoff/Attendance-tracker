import "server-only";
import { prisma } from "../prisma";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_EMAIL = 5;
const MAX_ATTEMPTS_PER_IP = 20;

export async function isLoginRateLimited(email: string, ip: string | undefined): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);

  const byEmail = await prisma.loginAttempt.count({
    where: { email, success: false, createdAt: { gte: since } },
  });
  if (byEmail >= MAX_ATTEMPTS_PER_EMAIL) return true;

  if (ip) {
    const byIp = await prisma.loginAttempt.count({
      where: { ip, success: false, createdAt: { gte: since } },
    });
    if (byIp >= MAX_ATTEMPTS_PER_IP) return true;
  }

  return false;
}

export async function recordLoginAttempt(email: string, ip: string | undefined, success: boolean, userId?: string) {
  await prisma.loginAttempt.create({
    data: { email, ip, success, userId },
  });
}

// Simple in-memory limiter for the approval-link endpoint, which is hit by
// unauthenticated requests (one-tap links). A fixed window per IP is enough
// to blunt brute-force guessing without needing a shared cache for a
// single-instance self-hosted deployment.
const approvalHits = new Map<string, { count: number; windowStart: number }>();
const APPROVAL_WINDOW_MS = 60 * 1000;
const APPROVAL_MAX_PER_WINDOW = 10;

export function isApprovalLinkRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = approvalHits.get(ip);
  if (!entry || now - entry.windowStart > APPROVAL_WINDOW_MS) {
    approvalHits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > APPROVAL_MAX_PER_WINDOW;
}
