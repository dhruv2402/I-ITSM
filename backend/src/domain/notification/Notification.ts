import { ChannelType } from '../enums';

export type DeliveryStatus = 'DELIVERED' | 'SENT' | 'SIMULATED' | 'FAILED';
export type Severity = 'info' | 'warning' | 'critical';

/** A notification delivered (or attempted) to one user through one channel. */
export interface NotificationRecord {
  id: string;
  userId: string;
  channel: ChannelType;
  eventType: string;
  incidentId: string | null;
  title: string;
  message: string;
  severity: Severity;
  status: DeliveryStatus;
  error?: string;
  read: boolean;
  createdAt: Date;
}
