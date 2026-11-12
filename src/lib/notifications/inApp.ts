import "server-only";
import { prisma } from "../prisma";
import type { NotificationAdapter, NotificationMessage } from "./types";

export const inAppAdapter: NotificationAdapter = {
  channel: "IN_APP",
  enabled: () => true,
  async send(message: NotificationMessage) {
    await prisma.inAppNotification.create({
      data: {
        userId: message.userId,
        title: message.subject,
        body: message.body,
        link: message.link,
      },
    });
  },
};
