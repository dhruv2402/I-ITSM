import { IncidentStatus, Priority } from '../../src/domain/enums';
import { EventType } from '../../src/domain/events/DomainEvent';
import { clock, FixedClock } from '../../src/shared/clock';
import { emptyContainer, seededContainer, userByEmail } from '../helpers';

describe('Background SLA monitoring & automatic escalation', () => {
  afterEach(() => clock.reset());

  test('TC13 unacknowledged P1 escalates Technician -> Team Lead -> Admin -> IT Manager and notifications go out', async () => {
    const fixed = new FixedClock(new Date());
    clock.use(fixed);
    const { c, email } = await seededContainer();
    const employee = await userByEmail(c, 'rohan@itsm.demo');
    const { incident } = await c.incidents.create(employee, {
      title: 'Authentication service down for everyone',
      description: 'Nobody can log in with SSO, every login fails with error 503.',
      serviceId: 'SVC-AUTH',
      impact: 4,
      urgency: 4,
      affectedUsers: 900,
    });
    expect(incident.priority).toBe(Priority.P1);
    expect(incident.status).toBe(IncidentStatus.ASSIGNED);

    fixed.advanceMinutes(6); // past the 5-minute response target
    let run = await c.slaMonitor.runOnce();
    expect(run.breaches).toBeGreaterThanOrEqual(1);
    expect(run.escalations).toBeGreaterThanOrEqual(1);

    fixed.advanceMinutes(10); // 16 minutes -> level 3
    run = await c.slaMonitor.runOnce();
    const after = await c.repos.incidents.findById(incident.id);
    expect(after!.escalationLevel).toBe(3);

    const trail = await c.repos.audit.search({ incidentId: incident.id });
    expect(trail.map((a) => a.action)).toEqual(expect.arrayContaining([EventType.SLA_RESPONSE_BREACHED, EventType.INCIDENT_ESCALATED]));
    const manager = await userByEmail(c, 'manager@itsm.demo');
    const managerInbox = await c.repos.notifications.findForUser(manager.id);
    expect(managerInbox.some((n) => n.incidentId === incident.id)).toBe(true);
    expect(email.outbox.some((m) => m.subject.includes('escalated'))).toBe(true);
  });

  test('acknowledged incidents are not escalated', async () => {
    const fixed = new FixedClock(new Date());
    clock.use(fixed);
    const { c } = await seededContainer();
    const employee = await userByEmail(c, 'priya@itsm.demo');
    const { incident } = await c.incidents.create(employee, {
      title: 'Core database cluster unreachable',
      description: 'All applications report database connection refused errors.',
      serviceId: 'SVC-DB',
      impact: 4,
      urgency: 4,
      affectedUsers: 1000,
    });
    const tech = await c.repos.users.findById(incident.assignedTechnicianId!);
    await c.incidents.acknowledge(tech!, incident.id);
    fixed.advanceMinutes(12);
    await c.slaMonitor.runOnce();
    expect((await c.repos.incidents.findById(incident.id))!.escalationLevel).toBe(0);
  });

  test('missing SLA configuration is handled gracefully and admins are alerted', async () => {
    const { c } = emptyContainer();
    const { seedDatabase } = await import('../../src/seed/seedData');
    await seedDatabase(c);
    for (const p of await c.repos.slaPolicies.findAll()) await c.repos.slaPolicies.delete(p.id);
    const employee = await userByEmail(c, 'employee@itsm.demo');
    const { incident } = await c.incidents.create(employee, {
      title: 'Printer offline in HR',
      description: 'The HR department printer shows offline since morning.',
      serviceId: 'SVC-LAPTOP',
      impact: 1,
      urgency: 2,
      affectedUsers: 5,
    });
    expect(incident.sla).toBeNull();
    const trail = await c.repos.audit.search({ incidentId: incident.id });
    expect(trail.some((a) => a.action === EventType.SLA_MISSING)).toBe(true);
  });
});
