import { randomUUID } from 'crypto';
import { DomainEvent } from '../domain/events/DomainEvent';
import { EventSubscriber } from '../domain/events/EventBus';
import { AuditRepository } from '../persistence/repositories';

/** Observer that writes every domain event to the immutable audit trail. */
export class AuditTrailSubscriber implements EventSubscriber {
  readonly name = 'AuditTrail';

  constructor(private readonly audit: AuditRepository) {}

  async handle(e: DomainEvent): Promise<void> {
    await this.audit.append({
      id: randomUUID(),
      timestamp: e.occurredAt,
      userId: e.actor.id,
      userName: e.actor.name,
      userRole: e.actor.role,
      action: e.type,
      incidentId: e.incident?.id ?? null,
      previousState: e.previousState ?? null,
      newState: e.newState ?? null,
      description: e.description,
    });
  }
}
