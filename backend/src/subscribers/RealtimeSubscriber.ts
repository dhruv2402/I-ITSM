import { DomainEvent } from '../domain/events/DomainEvent';
import { EventSubscriber } from '../domain/events/EventBus';
import { RealtimeHub } from '../notification/RealtimeHub';

/** Observer that pushes every incident change to connected dashboards (real-time operational view). */
export class RealtimeSubscriber implements EventSubscriber {
  readonly name = 'RealtimeDashboard';
  constructor(private readonly hub: RealtimeHub) {}

  handle(e: DomainEvent): void {
    if (!e.incident) return;
    this.hub.broadcast('incident', {
      type: e.type,
      incidentId: e.incident.id,
      priority: e.incident.priority,
      description: e.description,
      at: e.occurredAt,
    });
  }
}
