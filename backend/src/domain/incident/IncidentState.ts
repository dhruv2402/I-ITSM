import { IncidentStatus } from '../enums';
import { InvalidStateTransitionError } from '../errors';

export type IncidentAction =
  | 'classify'
  | 'assign'
  | 'acknowledge'
  | 'start'
  | 'requestInfo'
  | 'provideInfo'
  | 'resolve'
  | 'verify'
  | 'reopen'
  | 'close';

/**
 * State pattern for the incident lifecycle.
 *
 * Each concrete state knows which actions are legal from it, where they lead,
 * and how the incident behaves while in that state (is the SLA clock running,
 * may details still be edited, is the incident still open...). The Incident
 * delegates to its current state instead of using switch statements, so an
 * illegal move such as NEW -> CLOSED is impossible by construction.
 */
export abstract class IncidentState {
  abstract readonly status: IncidentStatus;
  protected abstract readonly transitions: Partial<Record<IncidentAction, IncidentStatus>>;

  /** Returns the state reached by performing `action`, or throws if illegal. */
  next(action: IncidentAction): IncidentState {
    const target = this.transitions[action];
    if (!target) throw new InvalidStateTransitionError(this.status, action);
    return IncidentStates.of(target);
  }

  can(action: IncidentAction): boolean {
    return this.transitions[action] !== undefined;
  }

  availableActions(): IncidentAction[] {
    return Object.keys(this.transitions) as IncidentAction[];
  }

  /** Is the incident still open (counts towards workload and SLA monitoring)? */
  isActive(): boolean {
    return true;
  }

  /** Does SLA resolution time keep running in this state? */
  slaClockRunning(): boolean {
    return true;
  }

  /** May the reporter / admin still change descriptive details? */
  allowsDetailEdits(): boolean {
    return true;
  }

  /** May new notes be added? */
  acceptsNotes(): boolean {
    return true;
  }

  abstract describe(): string;
}

class NewState extends IncidentState {
  readonly status = IncidentStatus.NEW;
  protected readonly transitions = { classify: IncidentStatus.CLASSIFIED };
  describe() {
    return 'Reported, waiting for classification';
  }
}

class ClassifiedState extends IncidentState {
  readonly status = IncidentStatus.CLASSIFIED;
  protected readonly transitions = { classify: IncidentStatus.CLASSIFIED, assign: IncidentStatus.ASSIGNED };
  describe() {
    return 'Classified and prioritised, waiting for a technician';
  }
}

class AssignedState extends IncidentState {
  readonly status = IncidentStatus.ASSIGNED;
  protected readonly transitions = {
    classify: IncidentStatus.ASSIGNED,
    assign: IncidentStatus.ASSIGNED,
    acknowledge: IncidentStatus.ACKNOWLEDGED,
  };
  describe() {
    return 'Assigned, waiting for the technician to acknowledge';
  }
}

class AcknowledgedState extends IncidentState {
  readonly status = IncidentStatus.ACKNOWLEDGED;
  protected readonly transitions = {
    classify: IncidentStatus.ACKNOWLEDGED,
    assign: IncidentStatus.ASSIGNED,
    start: IncidentStatus.IN_PROGRESS,
  };
  describe() {
    return 'Acknowledged by the technician';
  }
}

class InProgressState extends IncidentState {
  readonly status = IncidentStatus.IN_PROGRESS;
  protected readonly transitions = {
    classify: IncidentStatus.IN_PROGRESS,
    assign: IncidentStatus.ASSIGNED,
    requestInfo: IncidentStatus.PENDING_INFO,
    resolve: IncidentStatus.RESOLVED,
  };
  describe() {
    return 'Under investigation';
  }
}

class PendingInfoState extends IncidentState {
  readonly status = IncidentStatus.PENDING_INFO;
  protected readonly transitions = {
    assign: IncidentStatus.ASSIGNED,
    provideInfo: IncidentStatus.IN_PROGRESS,
  };
  slaClockRunning() {
    return false; // the clock is paused while we wait for the reporter
  }
  describe() {
    return 'Waiting for more information from the reporter (SLA paused)';
  }
}

class ResolvedState extends IncidentState {
  readonly status = IncidentStatus.RESOLVED;
  protected readonly transitions = { verify: IncidentStatus.VERIFIED, reopen: IncidentStatus.IN_PROGRESS };
  slaClockRunning() {
    return false;
  }
  allowsDetailEdits() {
    return false;
  }
  describe() {
    return 'Resolution provided, waiting for the reporter to confirm';
  }
}

class VerifiedState extends IncidentState {
  readonly status = IncidentStatus.VERIFIED;
  protected readonly transitions = { close: IncidentStatus.CLOSED, reopen: IncidentStatus.IN_PROGRESS };
  slaClockRunning() {
    return false;
  }
  allowsDetailEdits() {
    return false;
  }
  isActive() {
    return false;
  }
  describe() {
    return 'Resolution confirmed by the reporter';
  }
}

class ClosedState extends IncidentState {
  readonly status = IncidentStatus.CLOSED;
  protected readonly transitions = {};
  slaClockRunning() {
    return false;
  }
  allowsDetailEdits() {
    return false;
  }
  acceptsNotes() {
    return false;
  }
  isActive() {
    return false;
  }
  describe() {
    return 'Closed';
  }
}

/** Registry of the (stateless, shared) state objects. */
export class IncidentStates {
  private static readonly registry: Map<IncidentStatus, IncidentState> = new Map<IncidentStatus, IncidentState>([
    [IncidentStatus.NEW, new NewState()],
    [IncidentStatus.CLASSIFIED, new ClassifiedState()],
    [IncidentStatus.ASSIGNED, new AssignedState()],
    [IncidentStatus.ACKNOWLEDGED, new AcknowledgedState()],
    [IncidentStatus.IN_PROGRESS, new InProgressState()],
    [IncidentStatus.PENDING_INFO, new PendingInfoState()],
    [IncidentStatus.RESOLVED, new ResolvedState()],
    [IncidentStatus.VERIFIED, new VerifiedState()],
    [IncidentStatus.CLOSED, new ClosedState()],
  ]);

  static of(status: IncidentStatus): IncidentState {
    const s = IncidentStates.registry.get(status);
    if (!s) throw new Error(`Unknown incident status ${status}`);
    return s;
  }

  static activeStatuses(): IncidentStatus[] {
    return [...IncidentStates.registry.values()].filter((s) => s.isActive()).map((s) => s.status);
  }

  /** Full transition table, used by documentation and the UI lifecycle diagram. */
  static transitionTable(): { from: IncidentStatus; action: IncidentAction; to: IncidentStatus }[] {
    const rows: { from: IncidentStatus; action: IncidentAction; to: IncidentStatus }[] = [];
    for (const s of IncidentStates.registry.values()) {
      for (const a of s.availableActions()) rows.push({ from: s.status, action: a, to: s.next(a).status });
    }
    return rows;
  }
}
