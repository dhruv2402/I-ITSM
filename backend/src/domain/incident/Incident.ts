import { randomUUID } from 'crypto';
import { clock } from '../../shared/clock';
import { SlaPolicy } from '../catalog/SlaPolicy';
import { IncidentStatus, isLevel, Level, NoteType, Priority, SlaStatus } from '../enums';
import { ValidationError } from '../errors';
import { ActorRef, DomainEvent, EventType, IncidentRef } from '../events/DomainEvent';
import { IncidentAction, IncidentState, IncidentStates } from './IncidentState';
import { SlaSnapshot, SlaTracker } from './SlaTracker';

export interface WorkNote {
  id: string;
  type: NoteType;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: Date;
}

export interface Resolution {
  summary: string;
  rootCause: string;
  resolvedById: string;
  resolvedByName: string;
  resolvedAt: Date;
}

export interface Closure {
  closedById: string;
  closedByName: string;
  closedAt: Date;
  closureCode: string;
}

export interface Feedback {
  rating: number;
  comment: string;
  submittedAt: Date;
}

export interface PriorityAssessment {
  priority: Priority;
  score: number;
  strategy: string;
  rationale: string[];
}

export interface IncidentSnapshot {
  id: string;
  title: string;
  description: string;
  reporterId: string;
  reporterName: string;
  categoryCode: string | null;
  categoryConfidence: number | null;
  serviceId: string;
  impact: Level;
  urgency: Level;
  businessCriticality: Level;
  affectedUsers: number;
  priority: Priority | null;
  priorityScore: number | null;
  priorityStrategy: string | null;
  priorityRationale: string[];
  status: IncidentStatus;
  assignedTechnicianId: string | null;
  assignedTechnicianName: string | null;
  sla: SlaSnapshot | null;
  notes: WorkNote[];
  resolution: Resolution | null;
  closure: Closure | null;
  feedback: Feedback | null;
  escalationLevel: number;
  relatedIncidentIds: string[];
  duplicateOfId: string | null;
  reopenCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewIncidentInput {
  title: string;
  description: string;
  reporter: ActorRef;
  serviceId: string;
  impact: Level;
  urgency: Level;
  businessCriticality: Level;
  affectedUsers: number;
}

/**
 * Aggregate root of the domain. All changes to an incident go through these
 * methods, which (1) ask the current lifecycle State whether the move is legal,
 * (2) keep the invariants (SLA timestamps, assignment, resolution data) and
 * (3) record a domain event that observers turn into audit records and
 * notifications. Nothing outside the class can modify its fields directly.
 */
export class Incident {
  private state: IncidentState;
  private sla: SlaTracker | null;
  private pendingEvents: DomainEvent[] = [];

  private constructor(private data: Omit<IncidentSnapshot, 'status' | 'sla'>, status: IncidentStatus, sla: SlaSnapshot | null) {
    this.state = IncidentStates.of(status);
    this.sla = sla ? SlaTracker.fromSnapshot(sla) : null;
  }

  // ---------------------------------------------------------------- creation

  static create(id: string, input: NewIncidentInput): Incident {
    const title = (input.title ?? '').trim();
    const description = (input.description ?? '').trim();
    if (title.length < 5 || title.length > 120) throw new ValidationError('Title must be between 5 and 120 characters');
    if (description.length < 10 || description.length > 4000) {
      throw new ValidationError('Description must be between 10 and 4000 characters');
    }
    if (!isLevel(input.impact)) throw new ValidationError('Impact must be 1 (low) to 4 (extensive)');
    if (!isLevel(input.urgency)) throw new ValidationError('Urgency must be 1 (low) to 4 (critical)');
    if (!isLevel(input.businessCriticality)) throw new ValidationError('Business criticality must be 1-4');
    if (!Number.isInteger(input.affectedUsers) || input.affectedUsers < 1 || input.affectedUsers > 1_000_000) {
      throw new ValidationError('Affected users must be a whole number between 1 and 1,000,000');
    }
    const now = clock.now();
    const incident = new Incident(
      {
        id,
        title,
        description,
        reporterId: input.reporter.id,
        reporterName: input.reporter.name,
        categoryCode: null,
        categoryConfidence: null,
        serviceId: input.serviceId,
        impact: input.impact,
        urgency: input.urgency,
        businessCriticality: input.businessCriticality,
        affectedUsers: input.affectedUsers,
        priority: null,
        priorityScore: null,
        priorityStrategy: null,
        priorityRationale: [],
        assignedTechnicianId: null,
        assignedTechnicianName: null,
        notes: [],
        resolution: null,
        closure: null,
        feedback: null,
        escalationLevel: 0,
        relatedIncidentIds: [],
        duplicateOfId: null,
        reopenCount: 0,
        createdAt: now,
        updatedAt: now,
      },
      IncidentStatus.NEW,
      null,
    );
    incident.record(EventType.INCIDENT_CREATED, input.reporter, `${id} created by ${input.reporter.name}: "${title}"`, {
      previousState: null,
      newState: IncidentStatus.NEW,
    });
    return incident;
  }

  static fromSnapshot(s: IncidentSnapshot): Incident {
    const { status, sla, ...rest } = s;
    return new Incident(
      {
        ...rest,
        notes: (rest.notes ?? []).map((n) => ({ ...n, createdAt: new Date(n.createdAt) })),
        resolution: rest.resolution ? { ...rest.resolution, resolvedAt: new Date(rest.resolution.resolvedAt) } : null,
        closure: rest.closure ? { ...rest.closure, closedAt: new Date(rest.closure.closedAt) } : null,
        feedback: rest.feedback ? { ...rest.feedback, submittedAt: new Date(rest.feedback.submittedAt) } : null,
        relatedIncidentIds: [...(rest.relatedIncidentIds ?? [])],
        priorityRationale: [...(rest.priorityRationale ?? [])],
        createdAt: new Date(rest.createdAt),
        updatedAt: new Date(rest.updatedAt),
      },
      status,
      sla,
    );
  }

  // ---------------------------------------------------------------- queries

  get id(): string {
    return this.data.id;
  }
  get title(): string {
    return this.data.title;
  }
  get description(): string {
    return this.data.description;
  }
  get reporterId(): string {
    return this.data.reporterId;
  }
  get status(): IncidentStatus {
    return this.state.status;
  }
  get categoryCode(): string | null {
    return this.data.categoryCode;
  }
  get serviceId(): string {
    return this.data.serviceId;
  }
  get impact(): Level {
    return this.data.impact;
  }
  get urgency(): Level {
    return this.data.urgency;
  }
  get businessCriticality(): Level {
    return this.data.businessCriticality;
  }
  get affectedUsers(): number {
    return this.data.affectedUsers;
  }
  get priority(): Priority | null {
    return this.data.priority;
  }
  get assignedTechnicianId(): string | null {
    return this.data.assignedTechnicianId;
  }
  get escalationLevel(): number {
    return this.data.escalationLevel;
  }
  get createdAt(): Date {
    return this.data.createdAt;
  }
  get updatedAt(): Date {
    return this.data.updatedAt;
  }
  get resolution(): Resolution | null {
    return this.data.resolution ? { ...this.data.resolution } : null;
  }
  get feedback(): Feedback | null {
    return this.data.feedback ? { ...this.data.feedback } : null;
  }
  get relatedIncidentIds(): string[] {
    return [...this.data.relatedIncidentIds];
  }
  get duplicateOfId(): string | null {
    return this.data.duplicateOfId;
  }
  get slaTracker(): SlaTracker | null {
    return this.sla;
  }
  get notes(): WorkNote[] {
    return this.data.notes.map((n) => ({ ...n }));
  }

  isActive(): boolean {
    return this.state.isActive();
  }

  isReporter(userId: string): boolean {
    return this.data.reporterId === userId;
  }

  isAssignedTo(userId: string): boolean {
    return this.data.assignedTechnicianId === userId;
  }

  can(action: IncidentAction): boolean {
    return this.state.can(action);
  }

  availableActions(): IncidentAction[] {
    return this.state.availableActions();
  }

  slaStatus(now: Date = clock.now()): SlaStatus {
    return this.sla ? this.sla.status(now) : SlaStatus.NONE;
  }

  ref(): IncidentRef {
    return {
      id: this.data.id,
      title: this.data.title,
      priority: this.data.priority,
      reporterId: this.data.reporterId,
      assignedTechnicianId: this.data.assignedTechnicianId,
      serviceId: this.data.serviceId,
      categoryCode: this.data.categoryCode,
    };
  }

  /** Text used by the similarity / classification algorithms. */
  searchableText(): string {
    return `${this.data.title} ${this.data.description}`;
  }

  // ---------------------------------------------------------------- commands

  classify(categoryCode: string, actor: ActorRef, confidence: number | null = null): void {
    const code = categoryCode.toUpperCase();
    const prev = this.state;
    this.state = this.state.next('classify');
    const changed = this.data.categoryCode !== code;
    this.data.categoryCode = code;
    this.data.categoryConfidence = confidence;
    if (changed || prev !== this.state) {
      const how = confidence !== null ? ` (auto-suggested, ${(confidence * 100).toFixed(0)}% confidence)` : '';
      this.record(EventType.INCIDENT_CLASSIFIED, actor, `Incident classified as ${code}${how}`, {
        previousState: prev.status,
        newState: this.state.status,
      });
    }
  }

  applyPriority(assessment: PriorityAssessment, actor: ActorRef): boolean {
    this.ensureOpen('change priority');
    const previous = this.data.priority;
    this.data.priority = assessment.priority;
    this.data.priorityScore = assessment.score;
    this.data.priorityStrategy = assessment.strategy;
    this.data.priorityRationale = [...assessment.rationale];
    if (previous === null) {
      this.record(EventType.PRIORITY_CALCULATED, actor, `Priority calculated as ${assessment.priority} (score ${assessment.score}, ${assessment.strategy})`, {
        payload: { priority: assessment.priority, score: assessment.score },
      });
      return true;
    }
    if (previous !== assessment.priority) {
      this.record(EventType.PRIORITY_CHANGED, actor, `Priority changed from ${previous} to ${assessment.priority}`, {
        payload: { from: previous, to: assessment.priority },
      });
      return true;
    }
    return false;
  }

  attachSla(policy: SlaPolicy, actor: ActorRef): void {
    if (this.sla) this.sla.rebase(policy);
    else this.sla = SlaTracker.start(policy, this.data.createdAt);
    this.record(
      EventType.SLA_ASSIGNED,
      actor,
      `SLA "${policy.name}" applied: respond by ${this.sla.responseDueAt.toISOString()}, resolve by ${this.sla.resolutionDueAt.toISOString()}`,
    );
  }

  assignTo(technician: { id: string; name: string }, actor: ActorRef, reason: string): void {
    const prev = this.state;
    if (this.data.assignedTechnicianId === technician.id && prev.status !== IncidentStatus.CLASSIFIED) {
      throw new ValidationError(`${this.id} is already assigned to ${technician.name}`);
    }
    this.state = this.state.next('assign');
    const previousTech = this.data.assignedTechnicianName;
    this.data.assignedTechnicianId = technician.id;
    this.data.assignedTechnicianName = technician.name;
    const verb = previousTech ? `Reassigned from ${previousTech} to` : 'Assigned to';
    this.record(EventType.INCIDENT_ASSIGNED, actor, `${verb} technician ${technician.name} (${technician.id}) - ${reason}`, {
      previousState: prev.status,
      newState: this.state.status,
      payload: { technicianId: technician.id, reason },
    });
  }

  acknowledge(actor: ActorRef): void {
    const prev = this.state;
    this.state = this.state.next('acknowledge');
    const now = clock.now();
    this.sla?.markResponded(now);
    this.record(EventType.INCIDENT_ACKNOWLEDGED, actor, `Technician ${actor.name} acknowledged the incident`, {
      previousState: prev.status,
      newState: this.state.status,
    });
  }

  startWork(actor: ActorRef): void {
    const prev = this.state;
    this.state = this.state.next('start');
    this.sla?.markResponded(clock.now());
    this.record(EventType.WORK_STARTED, actor, 'Investigation started', { previousState: prev.status, newState: this.state.status });
  }

  addNote(actor: ActorRef, text: string, type: NoteType): WorkNote {
    if (!this.state.acceptsNotes()) throw new ValidationError(`Notes cannot be added to a ${this.status} incident`);
    const note = this.pushNote(actor, text, type);
    this.record(EventType.NOTE_ADDED, actor, `${type === NoteType.INVESTIGATION ? 'Investigation note' : 'Comment'} added: ${Incident.clip(text)}`, {
      payload: { noteType: type },
    });
    return note;
  }

  requestInfo(actor: ActorRef, question: string): void {
    const prev = this.state;
    this.state = this.state.next('requestInfo');
    this.pushNote(actor, question, NoteType.INFO_REQUEST);
    this.sla?.pause(clock.now());
    this.record(EventType.INFO_REQUESTED, actor, `More information requested: ${Incident.clip(question)}`, {
      previousState: prev.status,
      newState: this.state.status,
    });
  }

  provideInfo(actor: ActorRef, answer: string): void {
    const prev = this.state;
    this.state = this.state.next('provideInfo');
    this.pushNote(actor, answer, NoteType.INFO_RESPONSE);
    this.sla?.resume(clock.now());
    this.record(EventType.INFO_PROVIDED, actor, `Reporter provided information: ${Incident.clip(answer)}`, {
      previousState: prev.status,
      newState: this.state.status,
    });
  }

  resolve(actor: ActorRef, summary: string, rootCause: string): void {
    if (!summary || summary.trim().length < 10) throw new ValidationError('Resolution summary must have at least 10 characters');
    const prev = this.state;
    this.state = this.state.next('resolve');
    const now = clock.now();
    this.sla?.markResolved(now);
    this.data.resolution = {
      summary: summary.trim(),
      rootCause: (rootCause ?? '').trim(),
      resolvedById: actor.id,
      resolvedByName: actor.name,
      resolvedAt: now,
    };
    this.record(EventType.INCIDENT_RESOLVED, actor, `Incident marked RESOLVED: ${Incident.clip(summary)}`, {
      previousState: prev.status,
      newState: this.state.status,
    });
  }

  verify(actor: ActorRef): void {
    const prev = this.state;
    this.state = this.state.next('verify');
    this.record(EventType.INCIDENT_VERIFIED, actor, 'Resolution verified by the reporter', {
      previousState: prev.status,
      newState: this.state.status,
    });
  }

  reopen(actor: ActorRef, reason: string): void {
    if (!reason || reason.trim().length < 5) throw new ValidationError('Please explain why the incident is being reopened');
    const prev = this.state;
    this.state = this.state.next('reopen');
    this.data.resolution = null;
    this.data.reopenCount += 1;
    this.sla?.clearResolution();
    this.pushNote(actor, `Reopened: ${reason}`, NoteType.COMMENT);
    this.record(EventType.INCIDENT_REOPENED, actor, `Incident reopened: ${Incident.clip(reason)}`, {
      previousState: prev.status,
      newState: this.state.status,
    });
  }

  close(actor: ActorRef, closureCode = 'RESOLVED_PERMANENTLY'): void {
    const prev = this.state;
    this.state = this.state.next('close');
    this.data.closure = { closedById: actor.id, closedByName: actor.name, closedAt: clock.now(), closureCode };
    this.record(EventType.INCIDENT_CLOSED, actor, `Incident CLOSED (${closureCode})`, {
      previousState: prev.status,
      newState: this.state.status,
    });
  }

  submitFeedback(actor: ActorRef, rating: number, comment: string): void {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ValidationError('Rating must be between 1 and 5');
    if (![IncidentStatus.RESOLVED, IncidentStatus.VERIFIED, IncidentStatus.CLOSED].includes(this.status)) {
      throw new ValidationError('Feedback can only be given after the incident is resolved');
    }
    if (this.data.feedback) throw new ValidationError('Feedback has already been submitted for this incident');
    if (this.status === IncidentStatus.RESOLVED) this.verify(actor);
    this.data.feedback = { rating, comment: (comment ?? '').trim(), submittedAt: clock.now() };
    this.record(EventType.FEEDBACK_SUBMITTED, actor, `Feedback submitted: ${rating}/5`, { payload: { rating } });
  }

  updateDetails(
    actor: ActorRef,
    changes: Partial<Pick<IncidentSnapshot, 'title' | 'description' | 'impact' | 'urgency' | 'affectedUsers'>>,
  ): { priorityInputsChanged: boolean } {
    if (!this.state.allowsDetailEdits()) throw new ValidationError(`A ${this.status} incident can no longer be edited`);
    const before = { impact: this.data.impact, urgency: this.data.urgency, affectedUsers: this.data.affectedUsers };
    if (changes.title !== undefined) {
      const t = changes.title.trim();
      if (t.length < 5 || t.length > 120) throw new ValidationError('Title must be between 5 and 120 characters');
      this.data.title = t;
    }
    if (changes.description !== undefined) {
      const d = changes.description.trim();
      if (d.length < 10) throw new ValidationError('Description must have at least 10 characters');
      this.data.description = d;
    }
    if (changes.impact !== undefined) {
      if (!isLevel(changes.impact)) throw new ValidationError('Impact must be 1-4');
      this.data.impact = changes.impact;
    }
    if (changes.urgency !== undefined) {
      if (!isLevel(changes.urgency)) throw new ValidationError('Urgency must be 1-4');
      this.data.urgency = changes.urgency;
    }
    if (changes.affectedUsers !== undefined) {
      if (!Number.isInteger(changes.affectedUsers) || changes.affectedUsers < 1) throw new ValidationError('Affected users must be at least 1');
      this.data.affectedUsers = changes.affectedUsers;
    }
    const changedFields = Object.keys(changes).filter((k) => (changes as Record<string, unknown>)[k] !== undefined);
    this.record(EventType.INCIDENT_UPDATED, actor, `Details updated (${changedFields.join(', ')})`);
    return {
      priorityInputsChanged:
        before.impact !== this.data.impact || before.urgency !== this.data.urgency || before.affectedUsers !== this.data.affectedUsers,
    };
  }

  /** Escalation does not change the lifecycle state; it raises visibility up the chain. */
  escalate(level: number, target: string, reason: string, actor: ActorRef): void {
    if (level <= this.data.escalationLevel) return;
    this.data.escalationLevel = level;
    this.record(EventType.INCIDENT_ESCALATED, actor, `Escalated to level ${level} (${target}): ${reason}`, {
      payload: { level, target },
    });
  }

  linkRelated(ids: string[], actor: ActorRef, reason: string, asDuplicate: boolean): void {
    const fresh = ids.filter((i) => i !== this.id && !this.data.relatedIncidentIds.includes(i));
    if (fresh.length === 0) return;
    this.data.relatedIncidentIds.push(...fresh);
    this.record(asDuplicate ? EventType.DUPLICATE_DETECTED : EventType.INCIDENT_LINKED, actor, `${reason}: ${fresh.join(', ')}`, {
      payload: { relatedIds: fresh },
    });
  }

  markDuplicateOf(parentId: string, actor: ActorRef): void {
    if (parentId === this.id) throw new ValidationError('An incident cannot be a duplicate of itself');
    this.data.duplicateOfId = parentId;
    if (!this.data.relatedIncidentIds.includes(parentId)) this.data.relatedIncidentIds.push(parentId);
    this.record(EventType.INCIDENT_LINKED, actor, `Marked as duplicate of ${parentId}`, { payload: { parentId } });
  }

  // ---------------------------------------------------------------- SLA monitor hooks

  flagSlaWarning(): boolean {
    if (!this.sla || !this.state.slaClockRunning() || !this.sla.shouldWarn(clock.now())) return false;
    this.sla.flagWarning();
    const mins = Math.max(0, Math.round(this.sla.minutesToResolutionDeadline(clock.now())));
    this.record(EventType.SLA_WARNING, { id: 'SYSTEM', name: 'SLA Monitor', role: 'SYSTEM' }, `SLA warning: ${mins} min left to resolve`, {
      payload: { minutesLeft: mins },
    });
    return true;
  }

  flagSlaBreaches(): boolean {
    if (!this.sla) return false;
    const now = clock.now();
    let changed = false;
    const sys: ActorRef = { id: 'SYSTEM', name: 'SLA Monitor', role: 'SYSTEM' };
    if (!this.sla.responseBreached && this.sla.isResponseOverdue(now)) {
      this.sla.flagResponseBreach();
      this.record(EventType.SLA_RESPONSE_BREACHED, sys, `SLA violated: no response within ${this.sla.responseMinutes} min`);
      changed = true;
    }
    if (!this.sla.resolutionBreached && this.state.slaClockRunning() && this.sla.isResolutionOverdue(now)) {
      this.sla.flagResolutionBreach();
      this.record(EventType.SLA_RESOLUTION_BREACHED, sys, `SLA violated: not resolved within ${this.sla.resolutionMinutes} min`);
      changed = true;
    }
    return changed;
  }

  // ---------------------------------------------------------------- events & persistence

  /** Returns and clears the events raised since the last call. */
  pullEvents(): DomainEvent[] {
    const out = this.pendingEvents;
    this.pendingEvents = [];
    return out;
  }

  /** Lets services attach non-lifecycle events (e.g. assignment failures) to this incident. */
  raise(type: EventType, actor: ActorRef, description: string, payload?: Record<string, unknown>): void {
    this.record(type, actor, description, { payload });
  }

  toSnapshot(): IncidentSnapshot {
    return {
      ...this.data,
      notes: this.data.notes.map((n) => ({ ...n })),
      relatedIncidentIds: [...this.data.relatedIncidentIds],
      priorityRationale: [...this.data.priorityRationale],
      status: this.state.status,
      sla: this.sla ? this.sla.toSnapshot() : null,
    };
  }

  /** View model for the API, including derived values. */
  toView(now: Date = clock.now()) {
    const s = this.toSnapshot();
    return {
      ...s,
      slaStatus: this.slaStatus(now),
      stateDescription: this.state.describe(),
      availableActions: this.availableActions(),
      responseTimeMinutes: this.sla?.responseTimeMinutes() ?? null,
      resolutionTimeMinutes: this.sla?.resolutionTimeMinutes() ?? null,
      slaElapsedPct: this.sla ? Math.round(this.sla.elapsedFraction(now) * 100) : null,
    };
  }

  private pushNote(actor: ActorRef, text: string, type: NoteType): WorkNote {
    const t = (text ?? '').trim();
    if (t.length < 2) throw new ValidationError('Text must not be empty');
    if (t.length > 4000) throw new ValidationError('Text is too long (max 4000 characters)');
    const note: WorkNote = { id: randomUUID(), type, authorId: actor.id, authorName: actor.name, text: t, createdAt: clock.now() };
    this.data.notes.push(note);
    return note;
  }

  private ensureOpen(what: string): void {
    if (this.status === IncidentStatus.CLOSED) throw new ValidationError(`Cannot ${what} on a closed incident`);
  }

  private record(
    type: EventType,
    actor: ActorRef,
    description: string,
    extra: { previousState?: IncidentStatus | null; newState?: IncidentStatus | null; payload?: Record<string, unknown> } = {},
  ): void {
    this.data.updatedAt = clock.now();
    this.pendingEvents.push({
      type,
      actor,
      occurredAt: clock.now(),
      description,
      incident: this.ref(),
      previousState: extra.previousState,
      newState: extra.newState,
      payload: extra.payload,
    });
  }

  private static clip(text: string, max = 80): string {
    const t = text.trim().replace(/\s+/g, ' ');
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
  }
}
