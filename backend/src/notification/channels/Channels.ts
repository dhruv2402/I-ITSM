import { ChannelType } from '../../domain/enums';
import { EmailGateway } from '../adapters/EmailGateway';
import { SmsGateway } from '../adapters/SmsGateway';
import { RealtimeHub } from '../RealtimeHub';
import { DeliveryResult, NotificationChannel, NotificationMessage } from './NotificationChannel';

/** In-app notification: stored for the bell icon and pushed live over Server-Sent Events. */
export class InAppChannel implements NotificationChannel {
  readonly type = ChannelType.IN_APP;
  constructor(private readonly hub: RealtimeHub) {}

  async deliver(message: NotificationMessage): Promise<DeliveryResult> {
    this.hub.sendToUser(message.recipient.id, 'notification', {
      title: message.title,
      body: message.body,
      severity: message.severity,
      incidentId: message.incidentId,
    });
    return { status: 'DELIVERED' };
  }
}

/** E-mail notification through whichever EmailGateway adapter is configured. */
export class EmailChannel implements NotificationChannel {
  readonly type = ChannelType.EMAIL;
  constructor(private readonly gateway: EmailGateway) {}

  async deliver(message: NotificationMessage): Promise<DeliveryResult> {
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px">
      <h2 style="color:${message.severity === 'critical' ? '#b42318' : '#1d4ed8'}">${escapeHtml(message.title)}</h2>
      <p>Hello ${escapeHtml(message.recipient.name)},</p>
      <p>${escapeHtml(message.body)}</p>
      ${message.incidentId ? `<p><b>Incident:</b> ${escapeHtml(message.incidentId)}</p>` : ''}
      <hr/><small>I-ITSM Service Desk - automated notification</small></div>`;
    try {
      await this.gateway.send({ to: message.recipient.email, subject: `[I-ITSM] ${message.title}`, text: message.body, html });
      return { status: this.gateway.isSimulated ? 'SIMULATED' : 'SENT' };
    } catch (err) {
      return { status: 'FAILED', error: (err as Error).message };
    }
  }
}

/** SMS notification for urgent events only (selected by ChannelSelectionPolicy). */
export class SmsChannel implements NotificationChannel {
  readonly type = ChannelType.SMS;
  constructor(private readonly gateway: SmsGateway) {}

  async deliver(message: NotificationMessage): Promise<DeliveryResult> {
    if (!message.recipient.phone) return { status: 'FAILED', error: 'Recipient has no phone number' };
    try {
      await this.gateway.send(message.recipient.phone, `I-ITSM: ${message.title}. ${message.body}`);
      return { status: this.gateway.isSimulated ? 'SIMULATED' : 'SENT' };
    } catch (err) {
      return { status: 'FAILED', error: (err as Error).message };
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
