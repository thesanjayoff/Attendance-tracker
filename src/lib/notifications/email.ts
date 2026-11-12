import "server-only";
import nodemailer from "nodemailer";
import type { NotificationAdapter, NotificationMessage } from "./types";

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transporter;
}

export const emailAdapter: NotificationAdapter = {
  channel: "EMAIL",
  enabled: () => Boolean(process.env.SMTP_HOST),
  async send(message: NotificationMessage, recipient: { email: string }) {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM ?? "Attendance Tracker <no-reply@example.com>",
      to: recipient.email,
      subject: message.subject,
      text: message.body,
      html: message.link
        ? `<p>${escapeHtml(message.body)}</p><p><a href="${message.link}">Open in Attendance Tracker</a></p>`
        : `<p>${escapeHtml(message.body)}</p>`,
    });
  },
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
