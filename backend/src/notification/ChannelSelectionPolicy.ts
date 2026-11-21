import { ChannelType, Priority } from '../domain/enums';
import { EventType } from '../domain/events/DomainEvent';

/** Strategy for choosing which mechanisms deliver a given event. */
export interface ChannelSelectionPolicy {
  readonly name: string;
  channelsFor(type: EventType, priority: Priority | null): ChannelType[];
}

const EMAIL_EVENTS = new Set<EventType>([
  EventType.INCIDENT_CREATED,
  EventType.INCIDENT_ASSIGNED,
  EventType.PRIORITY_CHANGED,
  EventType.INFO_REQUESTED,
  EventType.INCIDENT_RESOLVED,
  EventType.INCIDENT_CLOSED,
  EventType.INCIDENT_REOPENED,
  EventType.SLA_WARNING,
  EventType.SLA_RESPONSE_BREACHED,
  EventType.SLA_RESOLUTION_BREACHED,
  EventType.INCIDENT_ESCALATED,
]);

const SMS_EVENTS = new Set<EventType>([
  EventType.SLA_RESPONSE_BREACHED,
  EventType.SLA_RESOLUTION_BREACHED,
  EventType.INCIDENT_ESCALATED,
]);

/**
 * Default policy: everything goes in-app; important events also go by e-mail;
 * SMS only for critical (P1) assignments, SLA violations and escalations.
 */
export class PriorityBasedChannelPolicy implements ChannelSelectionPolicy {
  readonly name = 'Priority-based';

  channelsFor(type: EventType, priority: Priority | null): ChannelType[] {
    const channels = [ChannelType.IN_APP];
    if (EMAIL_EVENTS.has(type)) channels.push(ChannelType.EMAIL);
    if (SMS_EVENTS.has(type) || (priority === Priority.P1 && type === EventType.INCIDENT_ASSIGNED)) channels.push(ChannelType.SMS);
    return channels;
  }
}
