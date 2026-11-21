import { IncidentStatus, Priority } from '../domain/enums';
import { SYSTEM_ACTOR } from '../domain/events/DomainEvent';
import { Incident } from '../domain/incident/Incident';
import { clock } from '../shared/clock';

export const ESCALATION_CHAIN = ['Technician', 'Team Lead', 'System Administrator', 'IT Manager'] as const;

/**
 * Intelligent feature C - Automatic escalation.
 * A P1/P2 incident that is still not acknowledged climbs one level of the chain
 * (Technician -> Team Lead -> System Administrator -> IT Manager) every time
 * another response window passes without acknowledgement.
 */
export class EscalationService {
  constructor(private readonly escalatingPriorities: Priority[] = [Priority.P1, Priority.P2]) {}

  /** Returns true when the incident was escalated. */
  evaluate(incident: Incident): boolean {
    const sla = incident.slaTracker;
    if (!sla || !incident.priority || !this.escalatingPriorities.includes(incident.priority)) return false;
    const waiting = [IncidentStatus.NEW, IncidentStatus.CLASSIFIED, IncidentStatus.ASSIGNED].includes(incident.status);
    if (!waiting) return false;
    const minutesWaiting = (clock.now().getTime() - incident.createdAt.getTime()) / 60_000;
    const level = Math.min(ESCALATION_CHAIN.length - 1, Math.floor(minutesWaiting / sla.responseMinutes));
    if (level <= incident.escalationLevel) return false;
    incident.escalate(
      level,
      ESCALATION_CHAIN[level],
      `${incident.priority} not acknowledged after ${Math.round(minutesWaiting)} min (response target ${sla.responseMinutes} min)`,
      SYSTEM_ACTOR,
    );
    return true;
  }
}
