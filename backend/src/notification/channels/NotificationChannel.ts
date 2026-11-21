import { ChannelType } from '../../domain/enums';
import { DeliveryStatus, Severity } from '../../domain/notification/Notification';

export interface Recipient {
  id: string;
  name: string;
  email: string;
  phone?: string;
}

export interface NotificationMessage {
  recipient: Recipient;
  eventType: string;
  incidentId: string | null;
  title: string;
  body: string;
  severity: Severity;
}

export interface DeliveryResult {
  status: DeliveryStatus;
  error?: string;
}

/**
 * Common contract for all notification mechanisms. New mechanisms (push,
 * Slack, Teams...) are added by implementing this interface and registering
 * the class in NotificationFactory; nothing else changes.
 */
export interface NotificationChannel {
  readonly type: ChannelType;
  deliver(message: NotificationMessage): Promise<DeliveryResult>;
}
