import { ChannelType, Priority } from '../domain/enums';
import { DomainEvent, EventType } from '../domain/events/DomainEvent';
import { Severity } from '../domain/notification/Notification';
import { EmailGateway } from './adapters/EmailGateway';
import { SmsGateway } from './adapters/SmsGateway';
import { EmailChannel, InAppChannel, SmsChannel } from './channels/Channels';
import { NotificationChannel, NotificationMessage, Recipient } from './channels/NotificationChannel';
import { RealtimeHub } from './RealtimeHub';

/**
 * Factory pattern for notifications:
 *  - createChannel() builds the concrete channel object for a ChannelType
 *  - createMessage() builds the message (title/body/severity) for an event
 */
export class NotificationFactory {
  constructor(
    private readonly deps: { hub: RealtimeHub; email: EmailGateway; sms: SmsGateway },
  ) {}

  createChannel(type: ChannelType): NotificationChannel {
    switch (type) {
      case ChannelType.IN_APP:
        return new InAppChannel(this.deps.hub);
      case ChannelType.EMAIL:
        return new EmailChannel(this.deps.email);
      case ChannelType.SMS:
        return new SmsChannel(this.deps.sms);
      default:
        throw new Error(`Unsupported channel ${String(type)}`);
    }
  }

  createMessage(event: DomainEvent, recipient: Recipient): NotificationMessage {
    const inc = event.incident;
    const id = inc?.id ?? '';
    const pr = inc?.priority ? ` [${inc.priority}]` : '';
    const titles: Partial<Record<EventType, string>> = {
      [EventType.INCIDENT_CREATED]: `Incident ${id} created${pr}`,
      [EventType.INCIDENT_ASSIGNED]: `Incident ${id} assigned${pr}`,
      [EventType.PRIORITY_CHANGED]: `Priority of ${id} changed`,
      [EventType.INCIDENT_ACKNOWLEDGED]: `${id} acknowledged by technician`,
      [EventType.WORK_STARTED]: `Work started on ${id}`,
      [EventType.INFO_REQUESTED]: `Information needed for ${id}`,
      [EventType.INFO_PROVIDED]: `Reporter replied on ${id}`,
      [EventType.NOTE_ADDED]: `New comment on ${id}`,
      [EventType.INCIDENT_RESOLVED]: `Incident ${id} resolved`,
      [EventType.INCIDENT_REOPENED]: `Incident ${id} reopened`,
      [EventType.INCIDENT_CLOSED]: `Incident ${id} closed`,
      [EventType.SLA_WARNING]: `SLA approaching for ${id}${pr}`,
      [EventType.SLA_RESPONSE_BREACHED]: `SLA VIOLATED (response) on ${id}${pr}`,
      [EventType.SLA_RESOLUTION_BREACHED]: `SLA VIOLATED (resolution) on ${id}${pr}`,
      [EventType.INCIDENT_ESCALATED]: `Incident ${id} escalated${pr}`,
      [EventType.DUPLICATE_DETECTED]: `Possible duplicate incidents for ${id}`,
      [EventType.ASSIGNMENT_FAILED]: `No technician available for ${id}${pr}`,
      [EventType.SLA_MISSING]: `Missing SLA configuration for ${id}`,
      [EventType.FEEDBACK_SUBMITTED]: `Feedback received on ${id}`,
    };
    return {
      recipient,
      eventType: event.type,
      incidentId: inc?.id ?? null,
      title: titles[event.type] ?? `${event.type.replace(/_/g, ' ').toLowerCase()} ${id}`,
      body: inc ? `${inc.title} - ${event.description}` : event.description,
      severity: NotificationFactory.severityOf(event.type, inc?.priority ?? null),
    };
  }

  static severityOf(type: EventType, priority: Priority | null): Severity {
    if ([EventType.SLA_RESPONSE_BREACHED, EventType.SLA_RESOLUTION_BREACHED, EventType.INCIDENT_ESCALATED].includes(type)) return 'critical';
    if (priority === Priority.P1 && [EventType.INCIDENT_CREATED, EventType.INCIDENT_ASSIGNED].includes(type)) return 'critical';
    if ([EventType.SLA_WARNING, EventType.ASSIGNMENT_FAILED, EventType.SLA_MISSING, EventType.DUPLICATE_DETECTED].includes(type)) return 'warning';
    return 'info';
  }
}
