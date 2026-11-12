"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "../../lib/prisma";
import { verifyPassword } from "../../lib/auth/password";
import { createSession, setSessionCookie, destroyCurrentSession, clientIp } from "../../lib/auth/session";
import { isLoginRateLimited, recordLoginAttempt } from "../../lib/auth/rateLimit";
import { logAudit } from "../../lib/audit";

export async function loginAction(_prevState: { error?: string } | undefined, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const hdrs = await headers();
  const ip = clientIp(hdrs);

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  if (await isLoginRateLimited(email, ip)) {
    return { error: "Too many failed attempts. Please try again in a few minutes." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;

  await recordLoginAttempt(email, ip, valid, user?.id);

  if (!user || !valid) {
    return { error: "Invalid email or password." };
  }
  if (user.status === "INACTIVE") {
    return { error: "This account has been deactivated." };
  }

  const token = await createSession(user.id);
  await setSessionCookie(token);
  await logAudit({ actorId: user.id, action: "LOGIN", entityType: "User", entityId: user.id, ip });

  redirect("/dashboard");
}

export async function logoutAction() {
  await destroyCurrentSession();
  redirect("/login");
}
