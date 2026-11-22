import { Role } from '../domain/enums';
import { DomainEvent, EventType } from '../domain/events/DomainEvent';
import { EventSubscriber } from '../domain/events/EventBus';
import { User } from '../domain/user/User';
import { Recipient } from '../notification/channels/NotificationChannel';
import { NotificationService } from '../notification/NotificationService';
import { UserRepository } from '../persistence/repositories';

type Audience = 'reporter' | 'assignee' | 'teamLeads' | 'admins' | 'managers';

/** Who must hear about which event. Data-driven, so adding a rule is a one-line change. */
const RULES: Partial<Record<EventType, Audience[]>> = {
  [EventType.INCIDENT_CREATED]: ['reporter'],
  [EventType.INCIDENT_ASSIGNED]: ['assignee', 'reporter'],
  [EventType.PRIORITY_CHANGED]: ['reporter', 'assignee'],
  [EventType.INCIDENT_ACKNOWLEDGED]: ['reporter'],
  [EventType.WORK_STARTED]: ['reporter'],
  [EventType.INFO_REQUESTED]: ['reporter'],
  [EventType.INFO_PROVIDED]: ['assignee'],
  [EventType.INCIDENT_RESOLVED]: ['reporter'],
  [EventType.INCIDENT_REOPENED]: ['assignee', 'teamLeads'],
  [EventType.INCIDENT_CLOSED]: ['reporter', 'assignee'],
  [EventType.FEEDBACK_SUBMITTED]: ['assignee'],
  [EventType.SLA_WARNING]: ['assignee', 'teamLeads'],
  [EventType.SLA_RESPONSE_BREACHED]: ['assignee', 'teamLeads', 'admins'],
  [EventType.SLA_RESOLUTION_BREACHED]: ['assignee', 'teamLeads', 'admins'],
  [EventType.DUPLICATE_DETECTED]: ['teamLeads'],
  [EventType.ASSIGNMENT_FAILED]: ['teamLeads', 'admins'],
  [EventType.SLA_MISSING]: ['admins'],
};

/** Escalation level -> audience (Technician -> Team Lead -> Admin -> IT Manager). */
const ESCALATION_AUDIENCE: Record<number, Audience[]> = {
  1: ['assignee', 'teamLeads'],
  2: ['assignee', 'teamLeads', 'admins'],
  3: ['assignee', 'teamLeads', 'admins', 'managers'],
};

/** Observer that turns domain events into notifications for the right people. */
export class NotificationSubscriber implements EventSubscriber {
  readonly name = 'Notifications';

  constructor(
    private readonly users: UserRepository,
    private readonly notifications: NotificationService,
  ) {}

  interestedIn(type: EventType): boolean {
    return type in RULES || type === EventType.INCIDENT_ESCALATED || type === EventType.NOTE_ADDED;
  }

  async handle(e: DomainEvent): Promise<void> {
    const inc = e.incident;
    if (!inc) return;
    let audience: Audience[] = RULES[e.type] ?? [];
    if (e.type === EventType.INCIDENT_ESCALATED) audience = ESCALATION_AUDIENCE[Number(e.payload?.level ?? 1)] ?? ['teamLeads'];
    if (e.type === EventType.NOTE_ADDED) {
      // a reporter's comment goes to the technician; a technician's comment goes to the reporter
      audience = e.actor.id === inc.reporterId ? ['assignee'] : e.payload?.noteType === 'COMMENT' ? ['reporter'] : [];
    }
    if (audience.length === 0) return;

    // look up all recipient groups in parallel (one database round trip instead of several)
    const byId = (id: string | null): Promise<User[]> => (id ? this.users.findById(id).then((u) => (u ? [u] : [])) : Promise.resolve([]));
    const lookups: Promise<User[]>[] = [];
    if (audience.includes('reporter')) lookups.push(byId(inc.reporterId));
    if (audience.includes('assignee')) lookups.push(byId(inc.assignedTechnicianId));
    if (audience.includes('teamLeads')) lookups.push(this.users.findByRoles([Role.TEAM_LEAD]));
    if (audience.includes('admins')) lookups.push(this.users.findByRoles([Role.ADMIN]));
    if (audience.includes('managers')) lookups.push(this.users.findByRoles([Role.MANAGER]));
    const recipients: User[] = (await Promise.all(lookups)).flat();

    // never notify people about their own action (except the creation receipt), and skip deactivated accounts
    const targets: Recipient[] = recipients
      .filter((u) => u.isActive && (u.id !== e.actor.id || e.type === EventType.INCIDENT_CREATED))
      .map((u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone }));
    if (targets.length) await this.notifications.notify(e, targets);
  }
}
