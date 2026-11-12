export interface NotificationMessage {
  userId: string;
  subject: string;
  body: string;
  link?: string;
}

export interface NotificationAdapter {
  channel: "IN_APP" | "EMAIL" | "TELEGRAM" | "WHATSAPP";
  enabled(): boolean;
  send(message: NotificationMessage, recipient: { email: string; telegramChatId?: string }): Promise<void>;
}
