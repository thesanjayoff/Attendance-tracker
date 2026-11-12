import "server-only";
import type { NotificationAdapter, NotificationMessage } from "./types";

export const telegramAdapter: NotificationAdapter = {
  channel: "TELEGRAM",
  enabled: () => Boolean(process.env.TELEGRAM_BOT_TOKEN),
  async send(message: NotificationMessage, recipient: { telegramChatId?: string }) {
    if (!recipient.telegramChatId) return;
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const text = message.link ? `${message.subject}\n\n${message.body}\n\n${message.link}` : `${message.subject}\n\n${message.body}`;
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: recipient.telegramChatId, text }),
    });
    if (!res.ok) {
      throw new Error(`Telegram send failed: ${res.status} ${await res.text()}`);
    }
  },
};

/**
 * WhatsApp is deliberately not implemented: the WhatsApp Business Platform
 * requires a paid Meta Business account and template approval, which is out
 * of scope for a self-hosted, no-subscription tool. This adapter exists so
 * the toggle and plumbing are ready — wire in a provider (e.g. the Meta
 * Cloud API or a BSP) here when one is available.
 */
export const whatsappAdapter: NotificationAdapter = {
  channel: "WHATSAPP",
  enabled: () => false,
  async send() {
    // Intentionally a no-op until a provider is configured.
  },
};
