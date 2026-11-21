import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../src/app';
import { Container } from '../../src/container';
import { DEMO_PASSWORD } from '../../src/seed/seedData';
import { seededContainer } from '../helpers';

/** End-to-end tests through the REST API (Express + services + in-memory repositories). */
describe('REST API integration', () => {
  let c: Container;
  let app: Express;
  const tokens: Record<string, string> = {};

  const login = async (email: string) => {
    const res = await request(app).post('/api/auth/login').send({ email, password: DEMO_PASSWORD });
    expect(res.status).toBe(200);
    return res.body.token as string;
  };
  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

  beforeAll(async () => {
    ({ c } = await seededContainer());
    app = createApp(c);
    tokens.employee = await login('employee@itsm.demo');
    tokens.priya = await login('priya@itsm.demo');
    tokens.rohan = await login('rohan@itsm.demo');
    tokens.tech = await login('technician@itsm.demo');
    tokens.lead = await login('teamlead@itsm.demo');
    tokens.admin = await login('admin@itsm.demo');
  });

  test('TC14 invalid login is rejected with a generic message', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'employee@itsm.demo', password: 'wrong-pass1' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_LOGIN');
    const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@itsm.demo', password: 'wrong-pass1' });
    expect(unknown.body.error.message).toBe(res.body.error.message);
  });

  test('requests without a token are rejected', async () => {
    expect((await request(app).get('/api/incidents')).status).toBe(401);
    expect((await request(app).get('/api/incidents').set({ Authorization: 'Bearer forged.token.value' })).status).toBe(401);
  });

  test('registration validates password strength and duplicate e-mail', async () => {
    const weak = await request(app).post('/api/auth/register').send({ name: 'New User', email: 'new@itsm.demo', password: 'password' });
    expect(weak.status).toBe(400);
    const ok = await request(app).post('/api/auth/register').send({ name: 'New User', email: 'new@itsm.demo', password: 'Secret123' });
    expect(ok.status).toBe(201);
    expect(ok.body.user.role).toBe('EMPLOYEE');
    expect(ok.body.user.passwordHash).toBeUndefined();
    const dup = await request(app).post('/api/auth/register').send({ name: 'New User', email: 'new@itsm.demo', password: 'Secret123' });
    expect(dup.status).toBe(409);
  });

  test('TC15 role-based authorisation: employees cannot reach admin features or other people\'s incidents', async () => {
    expect((await request(app).get('/api/admin/users').set(as('employee'))).status).toBe(403);
    expect((await request(app).get('/api/reports/overview').set(as('employee'))).status).toBe(403);
    expect((await request(app).put('/api/admin/settings').set(as('tech')).send({ assignmentStrategy: 'ROUND_ROBIN' })).status).toBe(403);
    const mine = await request(app).get('/api/incidents').set(as('employee'));
    expect(mine.status).toBe(200);
    expect(mine.body.items.every((i: { reporterId: string }) => i.reporterId === 'E1001')).toBe(true);
    const others = await request(app).get('/api/incidents/INC1038').set(as('employee')); // reported by Priya
    expect(others.status).toBe(403);
  });

  test('TC16 workflow 1+2: report -> auto prioritise -> assign -> notify -> investigate -> resolve -> verify -> close', async () => {
    const created = await request(app).post('/api/incidents').set(as('rohan')).send({
      title: 'Cannot login to HR portal',
      description: 'Every time I try to sign in to the HR portal the password is rejected.',
      serviceId: 'SVC-HR',
      impact: 1,
      urgency: 3,
      affectedUsers: 1,
    });
    expect(created.status).toBe(201);
    const inc = created.body.incident;
    expect(inc.categoryCode).toBe('AUTHENTICATION'); // auto-classified
    expect(inc.priority).toBeTruthy();
    expect(inc.sla.resolutionDueAt).toBeTruthy();
    expect(inc.status).toBe('ASSIGNED');
    expect(created.body.assignment.chosen.technicianId).toBeTruthy();

    // the assignee is notified in-app
    const techId = inc.assignedTechnicianId as string;
    const techUser = await c.repos.users.findById(techId);
    const techToken = (await request(app).post('/api/auth/login').send({ email: techUser!.email, password: DEMO_PASSWORD })).body.token;
    const T = { Authorization: `Bearer ${techToken}` };
    const bell = await request(app).get('/api/notifications').set(T);
    expect(bell.body.items.some((n: { incidentId: string }) => n.incidentId === inc.id)).toBe(true);

    // another technician cannot work on it
    if (techId !== 'T1003') {
      expect((await request(app).post(`/api/incidents/${inc.id}/acknowledge`).set(as('tech'))).status).toBe(403);
    }

    await request(app).post(`/api/incidents/${inc.id}/acknowledge`).set(T).expect(200);
    await request(app).post(`/api/incidents/${inc.id}/start`).set(T).expect(200);
    await request(app).post(`/api/incidents/${inc.id}/notes`).set(T).send({ text: 'Account locked in AD after 5 failed attempts', kind: 'INVESTIGATION' }).expect(200);
    await request(app).post(`/api/incidents/${inc.id}/request-info`).set(T).send({ text: 'Did you change your password recently?' }).expect(200);
    await request(app).post(`/api/incidents/${inc.id}/provide-info`).set(as('rohan')).send({ text: 'Yes, yesterday.' }).expect(200);
    await request(app).post(`/api/incidents/${inc.id}/resolve`).set(T).send({ summary: 'Unlocked the AD account and cleared cached credentials', rootCause: 'Cached old password' }).expect(200);
    const fb = await request(app).post(`/api/incidents/${inc.id}/feedback`).set(as('rohan')).send({ rating: 5, comment: 'Thanks' });
    expect(fb.body.status).toBe('VERIFIED');
    const closed = await request(app).post(`/api/incidents/${inc.id}/close`).set(T).send({});
    expect(closed.status).toBe(200);
    expect(closed.body.status).toBe('CLOSED');

    const audit = await request(app).get(`/api/incidents/${inc.id}/audit`).set(as('admin'));
    const actions = audit.body.map((a: { action: string }) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['INCIDENT_CREATED', 'INCIDENT_CLASSIFIED', 'PRIORITY_CALCULATED', 'INCIDENT_ASSIGNED', 'INCIDENT_ACKNOWLEDGED', 'INFO_REQUESTED', 'INCIDENT_RESOLVED', 'INCIDENT_CLOSED']));
    const resolvedRow = audit.body.find((a: { action: string }) => a.action === 'INCIDENT_RESOLVED');
    expect(resolvedRow.previousState).toBe('IN_PROGRESS');
    expect(resolvedRow.newState).toBe('RESOLVED');
  });

  test('TC17 invalid state transition returns 409', async () => {
    // INC1043 is CLASSIFIED and unassigned -> cannot be resolved
    const res = await request(app).post('/api/incidents/INC1043/resolve').set(as('admin')).send({ summary: 'Tried to resolve early', rootCause: '' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });

  test('TC18 workflow 3: similar reports are detected as duplicates and correlated', async () => {
    const a = await request(app).post('/api/incidents').set(as('priya')).send({
      title: 'Payment transaction failing',
      description: 'Customers cannot complete payment, transaction fails at checkout.',
      serviceId: 'SVC-PAY',
      impact: 4,
      urgency: 4,
      affectedUsers: 300,
    });
    expect(a.status).toBe(201);
    expect(a.body.duplicates.map((d: { incidentId: string }) => d.incidentId)).toContain('INC1037');
    const related = await request(app).get(`/api/incidents/${a.body.incident.id}/related`).set(as('lead'));
    expect(related.status).toBe(200);
    expect(related.body.correlations.length).toBeGreaterThan(0);
    const corr = await request(app).get('/api/reports/correlations').set(as('admin'));
    expect(corr.body.some((cl: { serviceId: string; type: string }) => cl.type === 'SAME_SERVICE' && cl.serviceId === 'SVC-PAY')).toBe(true);
  });

  test('the same reporter submitting the same problem twice gets DUPLICATE_INCIDENT', async () => {
    const body = { title: 'Email attachments not opening', description: 'PDF attachments in Outlook fail to open with an error.', serviceId: 'SVC-EMAIL', impact: 1, urgency: 2, affectedUsers: 1 };
    expect((await request(app).post('/api/incidents').set(as('employee')).send(body)).status).toBe(201);
    const again = await request(app).post('/api/incidents').set(as('employee')).send(body);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('DUPLICATE_INCIDENT');
  });

  test('invalid input and unknown service are rejected', async () => {
    const bad = await request(app).post('/api/incidents').set(as('employee')).send({ title: 'x', description: 'short', serviceId: 'SVC-PAY', impact: 9, urgency: 1 });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.length).toBeGreaterThan(0);
    const svc = await request(app).post('/api/incidents').set(as('employee')).send({ title: 'Some valid title', description: 'A long enough description', serviceId: 'SVC-NOPE', impact: 1, urgency: 1 });
    expect(svc.status).toBe(404);
    expect(svc.body.error.code).toBe('SERVICE_NOT_FOUND');
    expect((await request(app).get('/api/incidents/INC9999').set(as('admin'))).status).toBe(404);
  });

  test('manual assignment enforces availability and workload limits', async () => {
    // make Rahul unavailable
    await request(app).patch('/api/admin/users/T1005').set(as('admin')).send({ available: false }).expect(200);
    const res = await request(app).post('/api/incidents/INC1043/assign').set(as('lead')).send({ technicianId: 'T1005' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TECHNICIAN_UNAVAILABLE');
    // reduce Sneha's capacity below her current workload
    await request(app).patch('/api/admin/users/T1002').set(as('admin')).send({ maxWorkload: 1 }).expect(200);
    const full = await request(app).post('/api/incidents/INC1043/assign').set(as('lead')).send({ technicianId: 'T1002' });
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe('TECHNICIAN_WORKLOAD_EXCEEDED');
    const ok = await request(app).post('/api/incidents/INC1043/assign').set(as('lead')).send({ technicianId: 'T1003' });
    expect(ok.status).toBe(200);
    expect(ok.body.assignedTechnicianId).toBe('T1003');
  });

  test('search supports multiple filter criteria', async () => {
    const res = await request(app).get('/api/incidents?status=CLOSED&priority=P1,P2&serviceId=SVC-PAY&sortBy=priority').set(as('admin'));
    expect(res.status).toBe(200);
    expect(res.body.items.every((i: { status: string; serviceId: string }) => i.status === 'CLOSED' && i.serviceId === 'SVC-PAY')).toBe(true);
    const sla = await request(app).get('/api/incidents?slaStatus=BREACHED').set(as('admin'));
    expect(sla.body.items.some((i: { id: string }) => i.id === 'INC1044')).toBe(true);
    const text = await request(app).get('/api/incidents?text=vpn&technicianId=T1004').set(as('admin'));
    expect(text.body.items.map((i: { id: string }) => i.id)).toContain('INC1045');
  });

  test('admin changes the assignment strategy at runtime and reports work', async () => {
    const s = await request(app).put('/api/admin/settings').set(as('admin')).send({ assignmentStrategy: 'LOAD_BASED' });
    expect(s.body.assignmentStrategies.find((x: { active: boolean }) => x.active).key).toBe('LOAD_BASED');
    const o = await request(app).get('/api/reports/overview').set(as('admin'));
    expect(o.body.totalIncidents).toBeGreaterThan(40);
    expect((await request(app).get('/api/reports/technicians').set(as('admin'))).body.length).toBe(6);
    expect((await request(app).get('/api/reports/sla-risk').set(as('admin'))).status).toBe(200);
    const csv = await request(app).get('/api/incidents/export.csv').set(as('admin'));
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
  });

  test('admin can add a new category and SLA policy without code changes', async () => {
    const cat = await request(app).post('/api/admin/categories').set(as('admin')).send({ id: 'TELEPHONY', name: 'Telephony', keywords: ['desk phone', 'voip'] });
    expect(cat.status).toBe(201);
    const analyze = await request(app).post('/api/incidents/analyze').set(as('employee')).send({ title: 'Desk phone dead', description: 'My desk phone has no dial tone' });
    expect(analyze.body.categorySuggestion.categoryCode).toBe('TELEPHONY');
    const dupPolicy = await request(app).post('/api/admin/sla-policies').set(as('admin')).send({ name: 'dup', priority: 'P1', serviceId: null, responseMinutes: 5, resolutionMinutes: 30 });
    expect(dupPolicy.status).toBe(409);
    const badPolicy = await request(app).post('/api/admin/sla-policies').set(as('admin')).send({ name: 'bad', priority: 'P3', serviceId: 'SVC-HR', responseMinutes: 60, resolutionMinutes: 30 });
    expect(badPolicy.status).toBe(400);
  });
});
