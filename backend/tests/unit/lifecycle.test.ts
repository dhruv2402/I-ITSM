import { SlaPolicy } from '../../src/domain/catalog/SlaPolicy';
import { IncidentStatus, Priority, Role, SlaStatus } from '../../src/domain/enums';
import { InvalidStateTransitionError, ValidationError } from '../../src/domain/errors';
import { EventType } from '../../src/domain/events/DomainEvent';
import { Incident } from '../../src/domain/incident/Incident';
import { IncidentStates } from '../../src/domain/incident/IncidentState';
import { clock, FixedClock } from '../../src/shared/clock';

const reporter = { id: 'E1', name: 'Emp', role: Role.EMPLOYEE };
const tech = { id: 'T1', name: 'Tech', role: Role.TECHNICIAN };
const policy = SlaPolicy.create({ id: 'P', name: 'P1 test', priority: Priority.P1, serviceId: null, responseMinutes: 5, resolutionMinutes: 30, warningThresholdPct: 75, active: true });

function newIncident(): Incident {
  return Incident.create('INC1', {
    title: 'Payment app down',
    description: 'Users cannot pay anything at all',
    reporter,
    serviceId: 'SVC-PAY',
    impact: 4,
    urgency: 4,
    businessCriticality: 4,
    affectedUsers: 100,
  });
}

describe('Incident lifecycle (State pattern)', () => {
  let fixed: FixedClock;
  beforeEach(() => {
    fixed = new FixedClock(new Date('2026-11-20T10:00:00Z'));
    clock.use(fixed);
  });
  afterAll(() => clock.reset());

  test('TC04 full happy path NEW -> ... -> CLOSED records audit events', () => {
    const i = newIncident();
    i.classify('APPLICATION', tech);
    i.applyPriority({ priority: Priority.P1, score: 90, strategy: 'WEIGHTED', rationale: [] }, tech);
    i.attachSla(policy, tech);
    i.assignTo({ id: 'T1', name: 'Tech' }, tech, 'test');
    i.acknowledge(tech);
    i.startWork(tech);
    i.resolve(tech, 'Restarted the payment pods', 'Memory leak');
    i.verify(reporter);
    i.close(tech);
    expect(i.status).toBe(IncidentStatus.CLOSED);
    const types = i.pullEvents().map((e) => e.type);
    expect(types).toEqual(
      expect.arrayContaining([EventType.INCIDENT_CREATED, EventType.INCIDENT_ASSIGNED, EventType.INCIDENT_RESOLVED, EventType.INCIDENT_CLOSED]),
    );
    expect(i.pullEvents()).toHaveLength(0); // events are drained once
  });

  test('TC05 NEW -> CLOSED is rejected (invalid state transition)', () => {
    const i = newIncident();
    expect(() => i.close(tech)).toThrow(InvalidStateTransitionError);
    expect(() => i.resolve(tech, 'some resolution text', '')).toThrow(InvalidStateTransitionError);
    expect(i.status).toBe(IncidentStatus.NEW);
  });

  test('closed is terminal and rejects notes', () => {
    expect(IncidentStates.of(IncidentStatus.CLOSED).availableActions()).toHaveLength(0);
    expect(IncidentStates.transitionTable().some((t) => t.from === IncidentStatus.NEW && t.to === IncidentStatus.CLOSED)).toBe(false);
  });

  test('TC06 invalid input: too-short title is rejected', () => {
    expect(() =>
      Incident.create('X', { title: 'abc', description: 'long enough description', reporter, serviceId: 'S', impact: 1, urgency: 1, businessCriticality: 1, affectedUsers: 1 }),
    ).toThrow(ValidationError);
    expect(() =>
      Incident.create('X', { title: 'valid title', description: 'long enough description', reporter, serviceId: 'S', impact: 5 as never, urgency: 1, businessCriticality: 1, affectedUsers: 1 }),
    ).toThrow(/Impact/);
  });

  test('TC07 SLA deadlines, warning and breach detection', () => {
    const i = newIncident();
    i.classify('APPLICATION', tech);
    i.attachSla(policy, tech);
    expect(i.slaTracker!.responseDueAt.toISOString()).toBe('2026-11-20T10:05:00.000Z');
    expect(i.slaTracker!.resolutionDueAt.toISOString()).toBe('2026-11-20T10:30:00.000Z');
    fixed.advanceMinutes(23); // 76% of 30 minutes
    expect(i.flagSlaWarning()).toBe(true);
    expect(i.flagSlaWarning()).toBe(false); // only once
    expect(i.slaStatus()).toBe(SlaStatus.BREACHED); // response target (5 min) already missed
    expect(i.flagSlaBreaches()).toBe(true);
    expect(i.slaTracker!.responseBreached).toBe(true);
  });

  test('SLA clock pauses while waiting for the reporter and the deadline moves', () => {
    const i = newIncident();
    i.classify('APPLICATION', tech);
    i.attachSla(policy, tech);
    i.assignTo({ id: 'T1', name: 'Tech' }, tech, 'test');
    i.acknowledge(tech);
    i.startWork(tech);
    i.requestInfo(tech, 'Which browser are you using?');
    expect(i.slaStatus()).toBe(SlaStatus.PAUSED);
    fixed.advanceMinutes(60);
    i.provideInfo(reporter, 'Chrome 120 on Windows');
    expect(i.slaTracker!.resolutionDueAt.toISOString()).toBe('2026-11-20T11:30:00.000Z');
    expect(i.status).toBe(IncidentStatus.IN_PROGRESS);
  });

  test('reopen sends a resolved incident back to IN_PROGRESS and clears the resolution', () => {
    const i = newIncident();
    i.classify('APPLICATION', tech);
    i.assignTo({ id: 'T1', name: 'Tech' }, tech, 'test');
    i.acknowledge(tech);
    i.startWork(tech);
    i.resolve(tech, 'Cleared the cache on server', 'Cache');
    i.reopen(reporter, 'Still failing for me');
    expect(i.status).toBe(IncidentStatus.IN_PROGRESS);
    expect(i.resolution).toBeNull();
  });

  test('feedback boundary: rating must be 1..5 and only after resolution', () => {
    const i = newIncident();
    expect(() => i.submitFeedback(reporter, 5, 'great')).toThrow(/after the incident is resolved/);
    i.classify('APPLICATION', tech);
    i.assignTo({ id: 'T1', name: 'Tech' }, tech, 'test');
    i.acknowledge(tech);
    i.startWork(tech);
    i.resolve(tech, 'Cleared the cache on server', 'Cache');
    expect(() => i.submitFeedback(reporter, 0, '')).toThrow(/between 1 and 5/);
    expect(() => i.submitFeedback(reporter, 6, '')).toThrow(/between 1 and 5/);
    i.submitFeedback(reporter, 5, 'great');
    expect(i.status).toBe(IncidentStatus.VERIFIED); // feedback auto-verifies
  });

  test('snapshot round-trip preserves state (persistence mapping)', () => {
    const i = newIncident();
    i.classify('APPLICATION', tech);
    i.attachSla(policy, tech);
    const copy = Incident.fromSnapshot(JSON.parse(JSON.stringify(i.toSnapshot())));
    expect(copy.status).toBe(IncidentStatus.CLASSIFIED);
    expect(copy.slaTracker!.resolutionDueAt.getTime()).toBe(i.slaTracker!.resolutionDueAt.getTime());
  });
});
