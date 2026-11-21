import { DomainEvent, EventType } from './DomainEvent';

/** Observer contract: anything that wants to react to domain events. */
export interface EventSubscriber {
  readonly name: string;
  /** Optional filter; when absent the subscriber receives every event. */
  interestedIn?(type: EventType): boolean;
  handle(event: DomainEvent): Promise<void> | void;
}

/**
 * Subject of the Observer pattern. Incident logic publishes events and has no
 * idea that auditing, notifications or the live dashboard exist, so new
 * reactions can be added without touching the incident workflow.
 * A failing subscriber never breaks the business operation or other subscribers.
 */
export class EventBus {
  private readonly subscribers: EventSubscriber[] = [];

  subscribe(subscriber: EventSubscriber): () => void {
    this.subscribers.push(subscriber);
    return () => this.unsubscribe(subscriber);
  }

  unsubscribe(subscriber: EventSubscriber): void {
    const i = this.subscribers.indexOf(subscriber);
    if (i >= 0) this.subscribers.splice(i, 1);
  }

  subscriberNames(): string[] {
    return this.subscribers.map((s) => s.name);
  }

  async publish(event: DomainEvent): Promise<void> {
    for (const s of this.subscribers) {
      if (s.interestedIn && !s.interestedIn(event.type)) continue;
      try {
        await s.handle(event);
      } catch (err) {
        console.error(`[EventBus] subscriber ${s.name} failed on ${event.type}:`, (err as Error).message);
      }
    }
  }

  async publishAll(events: DomainEvent[]): Promise<void> {
    for (const e of events) await this.publish(e);
  }
}
