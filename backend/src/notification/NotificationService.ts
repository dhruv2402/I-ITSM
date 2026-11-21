import { randomUUID } from 'crypto';
import { ChannelType } from '../domain/enums';
import { DomainEvent } from '../domain/events/DomainEvent';
import { NotificationRecord } from '../domain/notification/Notification';
import { NotificationRepository } from '../persistence/repositories';
import { clock } from '../shared/clock';
import { ChannelSelectionPolicy } from './ChannelSelectionPolicy';
import { NotificationChannel, Recipient } from './channels/NotificationChannel';
import { NotificationFactory } from './NotificationFactory';

/** Sends one event to a set of recipients over the channels chosen by the policy, and logs every delivery. */
export class NotificationService {
  private readonly channels = new Map<ChannelType, NotificationChannel>();

  constructor(
    private readonly factory: NotificationFactory,
    private readonly policy: ChannelSelectionPolicy,
    private readonly repo: NotificationRepository,
  ) {
    for (const t of Object.values(ChannelType)) this.channels.set(t, factory.createChannel(t));
  }

  async notify(event: DomainEvent, recipients: Recipient[]): Promise<NotificationRecord[]> {
    const unique = [...new Map(recipients.map((r) => [r.id, r])).values()];
    const types = this.policy.channelsFor(event.type, event.incident?.priority ?? null);
    const out: NotificationRecord[] = [];
    for (const r of unique) {
      const message = this.factory.createMessage(event, r);
      for (const t of types) {
        const channel = this.channels.get(t)!;
        const result = await channel.deliver(message);
        const rec: NotificationRecord = {
          id: randomUUID(),
          userId: r.id,
          channel: t,
          eventType: event.type,
          incidentId: message.incidentId,
          title: message.title,
          message: message.body,
          severity: message.severity,
          status: result.status,
          error: result.error,
          read: t !== ChannelType.IN_APP,
          createdAt: clock.now(),
        };
        await this.repo.save(rec);
        out.push(rec);
      }
    }
    return out;
  }
}
