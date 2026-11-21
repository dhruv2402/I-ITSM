import { IncidentStatus, Priority, Role } from '../enums';

export enum EventType {
  INCIDENT_CREATED = 'INCIDENT_CREATED',
  INCIDENT_UPDATED = 'INCIDENT_UPDATED',
  INCIDENT_CLASSIFIED = 'INCIDENT_CLASSIFIED',
  PRIORITY_CALCULATED = 'PRIORITY_CALCULATED',
  PRIORITY_CHANGED = 'PRIORITY_CHANGED',
  SLA_ASSIGNED = 'SLA_ASSIGNED',
  SLA_MISSING = 'SLA_MISSING',
  INCIDENT_ASSIGNED = 'INCIDENT_ASSIGNED',
  ASSIGNMENT_FAILED = 'ASSIGNMENT_FAILED',
  INCIDENT_ACKNOWLEDGED = 'INCIDENT_ACKNOWLEDGED',
  WORK_STARTED = 'WORK_STARTED',
  NOTE_ADDED = 'NOTE_ADDED',
  INFO_REQUESTED = 'INFO_REQUESTED',
  INFO_PROVIDED = 'INFO_PROVIDED',
  INCIDENT_RESOLVED = 'INCIDENT_RESOLVED',
  INCIDENT_VERIFIED = 'INCIDENT_VERIFIED',
  INCIDENT_REOPENED = 'INCIDENT_REOPENED',
  INCIDENT_CLOSED = 'INCIDENT_CLOSED',
  FEEDBACK_SUBMITTED = 'FEEDBACK_SUBMITTED',
  SLA_WARNING = 'SLA_WARNING',
  SLA_RESPONSE_BREACHED = 'SLA_RESPONSE_BREACHED',
  SLA_RESOLUTION_BREACHED = 'SLA_RESOLUTION_BREACHED',
  INCIDENT_ESCALATED = 'INCIDENT_ESCALATED',
  DUPLICATE_DETECTED = 'DUPLICATE_DETECTED',
  INCIDENT_LINKED = 'INCIDENT_LINKED',
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  CONFIG_CHANGED = 'CONFIG_CHANGED',
  USER_LOGIN = 'USER_LOGIN',
}

export interface ActorRef {
  id: string;
  name: string;
  role: Role | 'SYSTEM';
}

export const SYSTEM_ACTOR: ActorRef = { id: 'SYSTEM', name: 'I-ITSM System', role: 'SYSTEM' };

/** Minimal incident facts carried with every incident event so observers need no extra lookups. */
export interface IncidentRef {
  id: string;
  title: string;
  priority: Priority | null;
  reporterId: string;
  assignedTechnicianId: string | null;
  serviceId: string;
  categoryCode: string | null;
}

export interface DomainEvent {
  type: EventType;
  actor: ActorRef;
  occurredAt: Date;
  description: string;
  incident?: IncidentRef;
  previousState?: IncidentStatus | null;
  newState?: IncidentStatus | null;
  payload?: Record<string, unknown>;
}
