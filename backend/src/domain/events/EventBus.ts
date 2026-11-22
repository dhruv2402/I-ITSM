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

  /** Observers are independent of each other, so they handle an event concurrently. */
  async publish(event: DomainEvent): Promise<void> {
    await Promise.all(
      this.subscribers
        .filter((s) => !s.interestedIn || s.interestedIn(event.type))
        .map(async (s) => {
          try {
            await s.handle(event);
          } catch (err) {
            console.error(`[EventBus] subscriber ${s.name} failed on ${event.type}:`, (err as Error).message);
          }
        }),
    );
  }

  /** Events raised by one operation are processed concurrently (each carries its own timestamp). */
  async publishAll(events: DomainEvent[]): Promise<void> {
    await Promise.all(events.map((e) => this.publish(e)));
  }
}
