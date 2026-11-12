import "server-only";
import { prisma } from "../prisma";
import { inAppAdapter } from "./inApp";
import { emailAdapter } from "./email";
import { telegramAdapter, whatsappAdapter } from "./telegram";
import type { NotificationMessage } from "./types";

const ADAPTERS = [inAppAdapter, emailAdapter, telegramAdapter, whatsappAdapter];

/**
 * Sends a notification across every enabled channel for the given user,
 * logging each attempt. A failure on one channel never blocks the others.
 */
export async function notifyUser(message: NotificationMessage) {
  const [org, user] = await Promise.all([
    prisma.organization.findUnique({ where: { id: 1 } }),
    prisma.user.findUnique({ where: { id: message.userId } }),
  ]);
  if (!user) return;

  const channelToggle: Record<string, boolean> = {
    IN_APP: true,
    EMAIL: org?.notifyEmailEnabled ?? false,
    TELEGRAM: org?.notifyTelegramEnabled ?? false,
    WHATSAPP: org?.notifyWhatsappEnabled ?? false,
  };

  for (const adapter of ADAPTERS) {
    if (!channelToggle[adapter.channel] || !adapter.enabled()) continue;
    try {
      await adapter.send(message, { email: user.email, telegramChatId: user.telegramChatId ?? undefined });
      await prisma.notificationLog.create({
        data: { userId: user.id, channel: adapter.channel, subject: message.subject, body: message.body, status: "SENT" },
      });
    } catch (err) {
      await prisma.notificationLog.create({
        data: {
          userId: user.id,
          channel: adapter.channel,
          subject: message.subject,
          body: message.body,
          status: "FAILED",
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }
}
