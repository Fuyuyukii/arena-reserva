export interface NotificationInput {
  recipient: string;
  subject: string;
  message: string;
}

export interface NotificationClient {
  send(input: NotificationInput): Promise<void>;
}

export class ConsoleNotificationClient implements NotificationClient {
  async send(input: NotificationInput): Promise<void> {
    console.log(`[notification] to=${input.recipient} subject="${input.subject}"`);
  }
}
