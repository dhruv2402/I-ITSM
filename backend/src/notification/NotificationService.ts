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

  /** Deliveries still running in the background (e-mail / SMS); exposed for graceful shutdown and tests. */
  private readonly inFlight = new Set<Promise<void>>();

  /**
   * In-app notifications are delivered and stored before returning (they are fast and the UI relies on them).
   * External channels (e-mail, SMS) run in the background: a slow or blocked provider must never delay
   * the user's request. Each delivery is logged with its outcome when it finishes.
   */
  async notify(event: DomainEvent, recipients: Recipient[]): Promise<NotificationRecord[]> {
    const unique = [...new Map(recipients.map((r) => [r.id, r])).values()];
    const types = this.policy.channelsFor(event.type, event.incident?.priority ?? null);
    const out: NotificationRecord[] = [];
    for (const r of unique) {
      const message = this.factory.createMessage(event, r);
      for (const t of types) {
        const channel = this.channels.get(t)!;
        const record = (result: { status: NotificationRecord['status']; error?: string }): NotificationRecord => ({
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
        });
        if (t === ChannelType.IN_APP) {
          const rec = record(await channel.deliver(message));
          await this.repo.save(rec);
          out.push(rec);
          continue;
        }
        const job: Promise<void> = channel
          .deliver(message)
          .catch((err) => ({ status: 'FAILED' as const, error: (err as Error).message }))
          .then((result) => this.repo.save(record(result)))
          .catch((err) => console.error(`[notify] could not log ${t} delivery:`, (err as Error).message))
          .finally(() => this.inFlight.delete(job));
        this.inFlight.add(job);
      }
    }
    return out;
  }

  /** Waits for background deliveries (used by tests and on shutdown). */
  async flush(): Promise<void> {
    while (this.inFlight.size) await Promise.all([...this.inFlight]);
  }
}
