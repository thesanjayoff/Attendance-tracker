import "server-only";
import { randomBytes, createHash } from "crypto";
import { cookies, headers } from "next/headers";
import { prisma } from "../prisma";
import type { Role } from "@prisma/client";

export const SESSION_COOKIE = "att_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  managerId: string | null;
  secondApproverId: string | null;
  delegateId: string | null;
}

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<string> {
  const token = generateToken();
  const hdrs = await headers();
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      userAgent: hdrs.get("user-agent") ?? undefined,
      ip: clientIp(hdrs),
    },
  });
  return token;
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;

  const u = session.user;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    managerId: u.managerId,
    secondApproverId: u.secondApproverId,
    delegateId: u.delegateId,
  };
}

export async function destroyCurrentSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  await clearSessionCookie();
}

export async function destroyAllSessionsForUser(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}

export function clientIp(hdrs: Headers): string | undefined {
  const forwarded = hdrs.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return undefined;
}
