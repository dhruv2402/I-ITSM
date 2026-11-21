import { randomUUID } from 'crypto';
import { Category } from '../domain/catalog/Category';
import { ItService, ItServiceSnapshot } from '../domain/catalog/ItService';
import { SlaPolicy, SlaPolicySnapshot } from '../domain/catalog/SlaPolicy';
import { IncidentStatus, Level, NoteType, Priority, Role } from '../domain/enums';
import { Incident, IncidentSnapshot, WorkNote } from '../domain/incident/Incident';
import { SlaSnapshot } from '../domain/incident/SlaTracker';
import { UserSnapshot } from '../domain/user/User';
import { UserFactory } from '../domain/user/UserFactory';
import type { Container } from '../container';
import { AuthService } from '../services/AuthService';
import { addMinutes, clock } from '../shared/clock';
import { WeightedPriorityStrategy } from '../strategies/priority/WeightedPriorityStrategy';

/** Password of every demo account (test data only - documented in the README). */
export const DEMO_PASSWORD = 'Password@123';

const SERVICES: ItServiceSnapshot[] = [
  { id: 'SVC-NET', name: 'Corporate Network & VPN', description: 'LAN, Wi-Fi, VPN gateways, DNS', businessCriticality: 4, ownerTeam: 'Network Ops', userBase: 1200, dependsOn: [], active: true },
  { id: 'SVC-STOR', name: 'SAN Storage', description: 'Enterprise storage arrays and file shares', businessCriticality: 4, ownerTeam: 'Infrastructure', userBase: 1200, dependsOn: ['SVC-NET'], active: true },
  { id: 'SVC-DB', name: 'Core Database Cluster', description: 'Primary PostgreSQL/Oracle cluster', businessCriticality: 4, ownerTeam: 'DBA', userBase: 1200, dependsOn: ['SVC-NET', 'SVC-STOR'], active: true },
  { id: 'SVC-AUTH', name: 'Authentication / SSO', description: 'Identity provider, SSO, MFA', businessCriticality: 4, ownerTeam: 'IAM', userBase: 1200, dependsOn: ['SVC-DB', 'SVC-NET'], active: true },
  { id: 'SVC-PAY', name: 'Payment Gateway', description: 'Customer payments, UPI and card processing', businessCriticality: 4, ownerTeam: 'Payments', userBase: 2000, dependsOn: ['SVC-DB', 'SVC-AUTH', 'SVC-NET'], active: true },
  { id: 'SVC-ERP', name: 'ERP System', description: 'Finance, procurement and inventory', businessCriticality: 3, ownerTeam: 'Enterprise Apps', userBase: 400, dependsOn: ['SVC-DB', 'SVC-AUTH'], active: true },
  { id: 'SVC-HR', name: 'HR Portal', description: 'Leave, payroll and employee self-service', businessCriticality: 2, ownerTeam: 'Enterprise Apps', userBase: 1200, dependsOn: ['SVC-DB', 'SVC-AUTH'], active: true },
  { id: 'SVC-EMAIL', name: 'Email & Collaboration', description: 'Exchange / Outlook / Teams', businessCriticality: 3, ownerTeam: 'Workplace', userBase: 1200, dependsOn: ['SVC-NET', 'SVC-AUTH'], active: true },
  { id: 'SVC-CLOUD', name: 'Cloud Storage', description: 'Object storage buckets and shared cloud drives', businessCriticality: 3, ownerTeam: 'Cloud Platform', userBase: 600, dependsOn: ['SVC-NET', 'SVC-AUTH'], active: true },
  { id: 'SVC-LAPTOP', name: 'End-user Devices', description: 'Laptops, desktops, printers and peripherals', businessCriticality: 2, ownerTeam: 'Desktop Support', userBase: 1200, dependsOn: [], active: true },
];

const CATEGORIES: [string, string, string[]][] = [
  ['HARDWARE', 'Hardware', ['laptop', 'desktop', 'printer', 'monitor', 'keyboard', 'battery', 'charger', 'power', 'screen', 'mouse', 'device']],
  ['SOFTWARE', 'Software', ['excel', 'word', 'office', 'install', 'license', 'update', 'outlook', 'crash', 'driver', 'software']],
  ['NETWORK', 'Network', ['network', 'vpn', 'wifi', 'internet', 'dns', 'connectivity', 'router', 'firewall', 'bandwidth', 'disconnect']],
  ['DATABASE', 'Database', ['database', 'query', 'sql', 'table', 'index', 'deadlock', 'replication', 'db', 'report timeout']],
  ['CLOUD', 'Cloud', ['cloud', 'bucket', 'aws', 'azure', 'upload', 'container', 'kubernetes', 's3', 'iam']],
  ['SECURITY', 'Security', ['phishing', 'virus', 'malware', 'suspicious', 'breach', 'hacked', 'spam', 'ransomware', 'security']],
  ['AUTHENTICATION', 'Authentication', ['login', 'password', 'sso', 'locked', 'mfa', 'otp', 'sign in', 'authentication', 'account']],
  ['APPLICATION', 'Application', ['application', 'portal', 'payment', 'checkout', 'transaction', 'error 500', 'page', 'website', 'app']],
  ['STORAGE', 'Storage', ['storage', 'disk', 'quota', 'shared drive', 'file share', 'space', 'backup', 'nas']],
  ['GENERAL', 'General / Other', ['request', 'question', 'help']],
];

/** Default SLA table from the project brief + a stricter contract for the Payment Gateway. */
const SLA: Omit<SlaPolicySnapshot, 'id'>[] = [
  { name: 'Default P1 - Critical', priority: Priority.P1, serviceId: null, responseMinutes: 5, resolutionMinutes: 30, warningThresholdPct: 75, active: true },
  { name: 'Default P2 - High', priority: Priority.P2, serviceId: null, responseMinutes: 15, resolutionMinutes: 120, warningThresholdPct: 75, active: true },
  { name: 'Default P3 - Medium', priority: Priority.P3, serviceId: null, responseMinutes: 60, resolutionMinutes: 480, warningThresholdPct: 75, active: true },
  { name: 'Default P4 - Low', priority: Priority.P4, serviceId: null, responseMinutes: 240, resolutionMinutes: 1440, warningThresholdPct: 75, active: true },
  { name: 'Payments P1 (contractual)', priority: Priority.P1, serviceId: 'SVC-PAY', responseMinutes: 5, resolutionMinutes: 20, warningThresholdPct: 70, active: true },
  { name: 'Payments P2 (contractual)', priority: Priority.P2, serviceId: 'SVC-PAY', responseMinutes: 10, resolutionMinutes: 60, warningThresholdPct: 70, active: true },
];

interface Template {
  cat: string;
  svc: string;
  title: string;
  desc: string;
  fix: string;
  cause: string;
  impact: Level;
  urgency: Level;
  users: number;
}

const HISTORY: Template[] = [
  { cat: 'APPLICATION', svc: 'SVC-PAY', title: 'Payment page shows error 500 at checkout', desc: 'Customers get an internal server error when confirming payment on the checkout page.', fix: 'Rolled back faulty release 4.2.1 and restarted payment API pods.', cause: 'Bad deployment introduced a null pointer in payment validation', impact: 4, urgency: 4, users: 600 },
  { cat: 'AUTHENTICATION', svc: 'SVC-AUTH', title: 'Unable to login with SSO', desc: 'Single sign-on redirects back to the login page in a loop for the finance team.', fix: 'Renewed the expired SAML signing certificate on the identity provider.', cause: 'SSO certificate expired', impact: 3, urgency: 4, users: 150 },
  { cat: 'DATABASE', svc: 'SVC-DB', title: 'Database queries very slow', desc: 'Reports and ERP screens take more than a minute, database CPU at 100%.', fix: 'Killed the runaway query and added the missing index on orders.customer_id.', cause: 'Missing index caused full table scans', impact: 3, urgency: 3, users: 200 },
  { cat: 'NETWORK', svc: 'SVC-NET', title: 'VPN keeps disconnecting', desc: 'Remote employees lose the VPN connection every 10 minutes.', fix: 'Patched VPN concentrator firmware and increased session timeout.', cause: 'Firmware bug on VPN concentrator', impact: 3, urgency: 2, users: 80 },
  { cat: 'HARDWARE', svc: 'SVC-LAPTOP', title: 'Laptop not powering on', desc: 'My laptop does not turn on even when it is plugged into the charger.', fix: 'Replaced the faulty power adapter.', cause: 'Defective charger', impact: 1, urgency: 3, users: 1 },
  { cat: 'SOFTWARE', svc: 'SVC-LAPTOP', title: 'Excel crashes when opening large files', desc: 'Microsoft Excel crashes whenever I open the monthly sales workbook.', fix: 'Repaired the Office installation and disabled a faulty add-in.', cause: 'Corrupted third-party add-in', impact: 1, urgency: 2, users: 1 },
  { cat: 'CLOUD', svc: 'SVC-CLOUD', title: 'File upload to cloud storage failing', desc: 'Uploads to the shared cloud bucket fail with an access denied error.', fix: 'Restored the bucket IAM policy that was overwritten by automation.', cause: 'Misconfigured IAM policy', impact: 2, urgency: 3, users: 40 },
  { cat: 'SECURITY', svc: 'SVC-EMAIL', title: 'Phishing email asking for password', desc: 'Several employees received an email pretending to be IT asking to reset their password via a link.', fix: 'Blocked the sender domain, purged the messages from mailboxes and alerted staff.', cause: 'External phishing campaign', impact: 3, urgency: 4, users: 300 },
  { cat: 'STORAGE', svc: 'SVC-STOR', title: 'Shared drive full, cannot save files', desc: 'The department shared drive shows disk quota exceeded and nobody can save files.', fix: 'Expanded the volume by 500 GB and archived old project folders.', cause: 'Storage quota exhausted', impact: 2, urgency: 3, users: 35 },
  { cat: 'APPLICATION', svc: 'SVC-HR', title: 'HR portal leave application not submitting', desc: 'Clicking submit on the leave form does nothing; the browser console shows a timeout.', fix: 'Cleared the stuck job queue and restarted the HR application server.', cause: 'Background job queue deadlock', impact: 2, urgency: 2, users: 60 },
  { cat: 'AUTHENTICATION', svc: 'SVC-AUTH', title: 'Account locked after password change', desc: 'After changing my password I am locked out of all applications.', fix: 'Unlocked the account and removed cached credentials from the mobile device.', cause: 'Old password cached on phone caused repeated failed logins', impact: 1, urgency: 3, users: 1 },
  { cat: 'DATABASE', svc: 'SVC-ERP', title: 'ERP report generation timeout', desc: 'The monthly finance report in ERP times out after 5 minutes.', fix: 'Optimised the report SQL and scheduled it off-peak.', cause: 'Inefficient report query', impact: 2, urgency: 3, users: 25 },
  { cat: 'NETWORK', svc: 'SVC-NET', title: 'Office wifi very slow on 3rd floor', desc: 'Wifi on the 3rd floor is extremely slow and pages take a long time to load.', fix: 'Replaced a failed access point and rebalanced wireless channels.', cause: 'Failed wireless access point', impact: 2, urgency: 2, users: 45 },
  { cat: 'APPLICATION', svc: 'SVC-PAY', title: 'UPI payments failing for customers', desc: 'Customers report that UPI transactions fail with a timeout at the bank step.', fix: 'Switched to the backup payment provider connector until the vendor fixed their API.', cause: 'Third-party payment provider outage', impact: 4, urgency: 4, users: 900 },
  { cat: 'SOFTWARE', svc: 'SVC-EMAIL', title: 'Outlook not syncing emails', desc: 'Outlook stopped receiving new emails since this morning.', fix: 'Recreated the Outlook profile and rebuilt the OST cache file.', cause: 'Corrupted local mailbox cache', impact: 1, urgency: 2, users: 1 },
  { cat: 'HARDWARE', svc: 'SVC-LAPTOP', title: 'Printer not printing on 2nd floor', desc: 'The 2nd floor printer shows jobs queued but prints nothing.', fix: 'Cleared the print spooler and updated the printer driver.', cause: 'Stuck print spooler', impact: 2, urgency: 2, users: 20 },
];

let rngState = 42;
const rnd = () => (rngState = (rngState * 16807) % 2147483647) / 2147483647;

export async function seedDatabase(c: Container): Promise<Record<string, number>> {
  rngState = 42;
  const { repos } = c;
  const now = clock.now();
  const hash = await AuthService.hash(DEMO_PASSWORD);

  // ---------------------------------------------------------------- users
  const userSpecs: Omit<UserSnapshot, 'id' | 'passwordHash' | 'active' | 'createdAt'>[] = [
    { name: 'Aarav Sharma', email: 'employee@itsm.demo', role: Role.EMPLOYEE, department: 'Finance', phone: '+919800000001' },
    { name: 'Priya Nair', email: 'priya@itsm.demo', role: Role.EMPLOYEE, department: 'Marketing', phone: '+919800000002' },
    { name: 'Rohan Gupta', email: 'rohan@itsm.demo', role: Role.EMPLOYEE, department: 'Operations', phone: '+919800000003' },
    { name: 'Vikram Rao', email: 'vikram@itsm.demo', role: Role.TECHNICIAN, phone: '+919800000011', skills: ['NETWORK', 'CLOUD', 'SECURITY'], experienceYears: 6, maxWorkload: 6 },
    { name: 'Sneha Iyer', email: 'sneha@itsm.demo', role: Role.TECHNICIAN, phone: '+919800000012', skills: ['DATABASE', 'STORAGE', 'CLOUD'], experienceYears: 5, maxWorkload: 6 },
    { name: 'Arjun Mehta', email: 'technician@itsm.demo', role: Role.TECHNICIAN, phone: '+919800000013', skills: ['APPLICATION', 'SOFTWARE', 'AUTHENTICATION'], experienceYears: 3, maxWorkload: 5 },
    { name: 'Kavya Reddy', email: 'kavya@itsm.demo', role: Role.TECHNICIAN, phone: '+919800000014', skills: ['SECURITY', 'AUTHENTICATION', 'NETWORK'], experienceYears: 7, maxWorkload: 5 },
    { name: 'Rahul Verma', email: 'rahul@itsm.demo', role: Role.TECHNICIAN, phone: '+919800000015', skills: ['HARDWARE', 'SOFTWARE', 'GENERAL'], experienceYears: 2, maxWorkload: 6 },
    { name: 'Neha Kapoor', email: 'teamlead@itsm.demo', role: Role.TEAM_LEAD, phone: '+919800000021', skills: ['APPLICATION', 'DATABASE', 'NETWORK', 'CLOUD'], experienceYears: 10, maxWorkload: 4 },
    { name: 'Suresh Pillai', email: 'admin@itsm.demo', role: Role.ADMIN, phone: '+919800000031', department: 'IT' },
    { name: 'Anita Desai', email: 'manager@itsm.demo', role: Role.MANAGER, phone: '+919800000032', department: 'IT' },
  ];
  const byEmail = new Map<string, { id: string; name: string; role: Role }>();
  for (const spec of userSpecs) {
    const prefix = UserFactory.idPrefix(spec.role);
    const id = `${prefix}${await repos.sequences.next(`user-${prefix}`)}`;
    const u = UserFactory.create({ ...spec, id, passwordHash: hash, active: true, createdAt: addMinutes(now, -60 * 24 * 60), available: true });
    await repos.users.save(u);
    byEmail.set(spec.email, { id, name: spec.name, role: spec.role });
  }
  const U = (email: string) => byEmail.get(email)!;
  const employees = ['employee@itsm.demo', 'priya@itsm.demo', 'rohan@itsm.demo'].map(U);
  const technicians = userSpecs.filter((s) => s.skills).map((s) => ({ ...U(s.email), skills: s.skills! }));

  // ---------------------------------------------------------------- catalog
  for (const s of SERVICES) await repos.services.save(ItService.create(s));
  for (const [code, name, keywords] of CATEGORIES) {
    await repos.categories.save(Category.create({ id: code, name, description: `${name} incidents`, keywords, active: true }));
  }
  const policies: SlaPolicySnapshot[] = SLA.map((p, i) => ({ ...p, id: `SLA-${String(i + 1).padStart(3, '0')}` }));
  for (const p of policies) await repos.slaPolicies.save(SlaPolicy.create(p));
  const policyFor = (priority: Priority, svc: string) =>
    policies.find((p) => p.priority === priority && p.serviceId === svc) ?? policies.find((p) => p.priority === priority && p.serviceId === null)!;

  const priorityStrategy = new WeightedPriorityStrategy();
  const svcMap = new Map(SERVICES.map((s) => [s.id, s]));
  const assess = (t: { svc: string; impact: Level; urgency: Level; users: number }) =>
    priorityStrategy.calculate({
      impact: t.impact,
      urgency: t.urgency,
      businessCriticality: svcMap.get(t.svc)!.businessCriticality,
      affectedUsers: t.users,
      serviceUserBase: svcMap.get(t.svc)!.userBase,
    });

  const audit = async (incidentId: string, at: Date, actor: { id: string; name: string; role: string }, action: string, description: string, prev: IncidentStatus | null, next: IncidentStatus | null) =>
    repos.audit.append({ id: randomUUID(), timestamp: at, userId: actor.id, userName: actor.name, userRole: actor.role, action, incidentId, previousState: prev, newState: next, description });
  const SYS = { id: 'SYSTEM', name: 'I-ITSM System', role: 'SYSTEM' };

  const makeSla = (priority: Priority, svc: string, created: Date, respondedAt: Date | null, resolvedAt: Date | null): SlaSnapshot => {
    const p = policyFor(priority, svc);
    const responseDueAt = addMinutes(created, p.responseMinutes);
    const resolutionDueAt = addMinutes(created, p.resolutionMinutes);
    return {
      policyId: p.id,
      policyName: p.name,
      responseMinutes: p.responseMinutes,
      resolutionMinutes: p.resolutionMinutes,
      warningThresholdPct: p.warningThresholdPct,
      startedAt: created,
      responseDueAt,
      resolutionDueAt,
      respondedAt,
      resolvedAt,
      pausedAt: null,
      totalPausedMinutes: 0,
      warningIssued: false,
      responseBreached: !!respondedAt && respondedAt > responseDueAt,
      resolutionBreached: !!resolvedAt && resolvedAt > resolutionDueAt,
    };
  };

  const base = (id: string, t: Template, reporter: { id: string; name: string }, created: Date): Omit<IncidentSnapshot, 'status' | 'sla'> => {
    const a = assess(t);
    return {
      id,
      title: t.title,
      description: t.desc,
      reporterId: reporter.id,
      reporterName: reporter.name,
      categoryCode: t.cat,
      categoryConfidence: null,
      serviceId: t.svc,
      impact: t.impact,
      urgency: t.urgency,
      businessCriticality: svcMap.get(t.svc)!.businessCriticality,
      affectedUsers: t.users,
      priority: a.priority,
      priorityScore: a.score,
      priorityStrategy: a.strategy,
      priorityRationale: a.rationale,
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
      createdAt: created,
      updatedAt: created,
    };
  };

  // ---------------------------------------------------------------- historical incidents (knowledge base + analytics)
  const rr = new Map<string, number>();
  let historical = 0;
  for (let i = 0; i < 36; i++) {
    const t = HISTORY[i % HISTORY.length];
    const reporter = employees[i % employees.length];
    const skilled = technicians.filter((x) => x.skills.includes(t.cat));
    const k = rr.get(t.cat) ?? 0;
    rr.set(t.cat, k + 1);
    const tech = skilled[k % skilled.length] ?? technicians[0];
    const created = addMinutes(now, -((1 + ((i * 13) % 20)) * 24 * 60 + Math.floor(rnd() * 600)));
    const id = await repos.incidents.nextId();
    const b = base(id, t, reporter, created);
    const policy = policyFor(b.priority!, t.svc);
    // ~10-15% of historical incidents miss a target, which gives a realistic compliance figure
    const respondedAt = addMinutes(created, Math.max(1, Math.round(policy.responseMinutes * (0.2 + rnd() * 0.92))));
    const resolvedAt = addMinutes(created, Math.max(policy.responseMinutes + 1, Math.round(policy.resolutionMinutes * (0.25 + rnd() * 0.88))));
    const closedAt = addMinutes(resolvedAt, 30 + Math.floor(rnd() * 600));
    const status = i % 9 === 4 ? IncidentStatus.VERIFIED : IncidentStatus.CLOSED;
    const rating = 3 + Math.floor(rnd() * 3);
    const notes: WorkNote[] = [
      { id: randomUUID(), type: NoteType.INVESTIGATION, authorId: tech.id, authorName: tech.name, text: `Investigating: ${t.cause.toLowerCase()} suspected.`, createdAt: addMinutes(respondedAt, 5) },
    ];
    const snap: IncidentSnapshot = {
      ...b,
      status,
      assignedTechnicianId: tech.id,
      assignedTechnicianName: tech.name,
      notes,
      sla: makeSla(b.priority!, t.svc, created, respondedAt, resolvedAt),
      resolution: { summary: t.fix, rootCause: t.cause, resolvedById: tech.id, resolvedByName: tech.name, resolvedAt },
      closure: status === IncidentStatus.CLOSED ? { closedById: tech.id, closedByName: tech.name, closedAt, closureCode: 'RESOLVED_PERMANENTLY' } : null,
      feedback: { rating, comment: rating >= 4 ? 'Quick and helpful, thanks!' : 'Fixed, but it took a while.', submittedAt: addMinutes(resolvedAt, 20) },
      updatedAt: closedAt,
    };
    await repos.incidents.save(Incident.fromSnapshot(snap));
    historical++;
    const r = { ...reporter, role: Role.EMPLOYEE };
    const tt = { ...tech, role: Role.TECHNICIAN };
    await audit(id, created, r, 'INCIDENT_CREATED', `${id} created by ${reporter.name}: "${t.title}"`, null, IncidentStatus.NEW);
    await audit(id, created, SYS, 'INCIDENT_CLASSIFIED', `Incident classified as ${t.cat}`, IncidentStatus.NEW, IncidentStatus.CLASSIFIED);
    await audit(id, created, SYS, 'PRIORITY_CALCULATED', `Priority calculated as ${b.priority} (score ${b.priorityScore})`, null, null);
    await audit(id, addMinutes(created, 1), SYS, 'INCIDENT_ASSIGNED', `Assigned to technician ${tech.name} (${tech.id})`, IncidentStatus.CLASSIFIED, IncidentStatus.ASSIGNED);
    await audit(id, respondedAt, tt, 'INCIDENT_ACKNOWLEDGED', `Technician ${tech.name} acknowledged the incident`, IncidentStatus.ASSIGNED, IncidentStatus.ACKNOWLEDGED);
    await audit(id, addMinutes(respondedAt, 2), tt, 'WORK_STARTED', 'Investigation started', IncidentStatus.ACKNOWLEDGED, IncidentStatus.IN_PROGRESS);
    await audit(id, resolvedAt, tt, 'INCIDENT_RESOLVED', `Incident marked RESOLVED: ${t.fix}`, IncidentStatus.IN_PROGRESS, IncidentStatus.RESOLVED);
    await audit(id, addMinutes(resolvedAt, 20), r, 'INCIDENT_VERIFIED', 'Resolution verified by the reporter', IncidentStatus.RESOLVED, IncidentStatus.VERIFIED);
    if (status === IncidentStatus.CLOSED) await audit(id, closedAt, tt, 'INCIDENT_CLOSED', 'Incident CLOSED (RESOLVED_PERMANENTLY)', IncidentStatus.VERIFIED, IncidentStatus.CLOSED);
  }

  // ---------------------------------------------------------------- live incidents for the demo
  const live: {
    t: Template;
    reporter: string;
    tech: string | null;
    status: IncidentStatus;
    minutesAgo: number;
    notes?: [string, NoteType, string][];
    resolution?: [string, string];
    breached?: boolean;
    escalation?: number;
  }[] = [
    { t: { cat: 'APPLICATION', svc: 'SVC-PAY', title: 'Payment application unavailable', desc: 'The payment application is down and users are unable to complete transactions. Checkout page does not load.', fix: '', cause: '', impact: 4, urgency: 4, users: 800 }, reporter: 'employee@itsm.demo', tech: 'technician@itsm.demo', status: IncidentStatus.ASSIGNED, minutesAgo: 2 },
    { t: { cat: 'DATABASE', svc: 'SVC-ERP', title: 'ERP reports timing out', desc: 'All ERP finance reports time out after a few minutes since this morning.', fix: '', cause: '', impact: 3, urgency: 3, users: 40 }, reporter: 'priya@itsm.demo', tech: 'sneha@itsm.demo', status: IncidentStatus.IN_PROGRESS, minutesAgo: 50, notes: [['sneha@itsm.demo', NoteType.INVESTIGATION, 'Long-running queries visible on the DB cluster, checking locks.']] },
    { t: { cat: 'APPLICATION', svc: 'SVC-HR', title: 'HR portal very slow to load', desc: 'HR portal pages take more than a minute to load, leave requests time out.', fix: '', cause: '', impact: 2, urgency: 3, users: 25 }, reporter: 'rohan@itsm.demo', tech: 'technician@itsm.demo', status: IncidentStatus.ACKNOWLEDGED, minutesAgo: 35 },
    { t: { cat: 'DATABASE', svc: 'SVC-DB', title: 'Database query latency high on core cluster', desc: 'Monitoring shows query latency above 5 seconds on the primary database cluster.', fix: '', cause: '', impact: 3, urgency: 3, users: 100 }, reporter: 'rohan@itsm.demo', tech: 'sneha@itsm.demo', status: IncidentStatus.ASSIGNED, minutesAgo: 8 },
    { t: { cat: 'HARDWARE', svc: 'SVC-LAPTOP', title: 'Laptop battery not charging', desc: 'My laptop battery stays at 0% even when the charger is connected.', fix: '', cause: '', impact: 1, urgency: 2, users: 1 }, reporter: 'employee@itsm.demo', tech: 'rahul@itsm.demo', status: IncidentStatus.PENDING_INFO, minutesAgo: 26 * 60, notes: [['rahul@itsm.demo', NoteType.INFO_REQUEST, 'Please share the laptop asset tag and tell me whether the charger LED turns on.']] },
    { t: { cat: 'STORAGE', svc: 'SVC-STOR', title: 'Shared drive quota exceeded', desc: 'Finance shared drive shows quota exceeded and we cannot save month-end files.', fix: '', cause: '', impact: 2, urgency: 3, users: 15 }, reporter: 'employee@itsm.demo', tech: 'sneha@itsm.demo', status: IncidentStatus.RESOLVED, minutesAgo: 5 * 60, resolution: ['Increased the Finance share quota by 200 GB and moved 2023 archives to cold storage.', 'Quota exhausted by month-end exports'] },
    { t: { cat: 'SOFTWARE', svc: 'SVC-EMAIL', title: 'Outlook not syncing on mobile', desc: 'Outlook app on my phone stopped syncing new emails after the latest update.', fix: '', cause: '', impact: 1, urgency: 2, users: 1 }, reporter: 'priya@itsm.demo', tech: null, status: IncidentStatus.CLASSIFIED, minutesAgo: 10 },
    { t: { cat: 'CLOUD', svc: 'SVC-CLOUD', title: 'Cloud storage upload failing for marketing team', desc: 'Marketing team cannot upload campaign assets to the cloud bucket, uploads fail with access denied.', fix: '', cause: '', impact: 3, urgency: 3, users: 30 }, reporter: 'priya@itsm.demo', tech: 'vikram@itsm.demo', status: IncidentStatus.ASSIGNED, minutesAgo: 180, breached: true, escalation: 3 },
    { t: { cat: 'NETWORK', svc: 'SVC-NET', title: 'VPN disconnects frequently', desc: 'VPN drops every 15 minutes for remote staff in the Pune office.', fix: '', cause: '', impact: 2, urgency: 2, users: 12 }, reporter: 'rohan@itsm.demo', tech: 'kavya@itsm.demo', status: IncidentStatus.IN_PROGRESS, minutesAgo: 180, notes: [['kavya@itsm.demo', NoteType.INVESTIGATION, 'Packet loss seen on the Pune ISP link, raised ticket with ISP.']] },
  ];
  const acknowledgedStates = [IncidentStatus.ACKNOWLEDGED, IncidentStatus.IN_PROGRESS, IncidentStatus.PENDING_INFO, IncidentStatus.RESOLVED];
  for (const l of live) {
    const reporter = U(l.reporter);
    const tech = l.tech ? U(l.tech) : null;
    const created = addMinutes(now, -l.minutesAgo);
    const id = await repos.incidents.nextId();
    const b = base(id, l.t, reporter, created);
    const responded = acknowledgedStates.includes(l.status) ? addMinutes(created, Math.min(4, l.minutesAgo / 3)) : null;
    const resolvedAt = l.status === IncidentStatus.RESOLVED ? addMinutes(created, Math.round(policyFor(b.priority!, l.t.svc).resolutionMinutes * 0.6)) : null;
    const sla = makeSla(b.priority!, l.t.svc, created, responded, resolvedAt);
    if (l.breached) {
      sla.responseBreached = true;
      sla.resolutionBreached = true;
      sla.warningIssued = true;
    }
    if (l.status === IncidentStatus.PENDING_INFO) sla.pausedAt = addMinutes(created, 30);
    const notes: WorkNote[] = (l.notes ?? []).map(([email, type, text]) => ({ id: randomUUID(), type, authorId: U(email).id, authorName: U(email).name, text, createdAt: addMinutes(created, 25) }));
    const snap: IncidentSnapshot = {
      ...b,
      status: l.status,
      assignedTechnicianId: tech?.id ?? null,
      assignedTechnicianName: tech?.name ?? null,
      notes,
      sla,
      escalationLevel: l.escalation ?? 0,
      resolution: l.resolution && tech ? { summary: l.resolution[0], rootCause: l.resolution[1], resolvedById: tech.id, resolvedByName: tech.name, resolvedAt: resolvedAt! } : null,
      updatedAt: addMinutes(created, Math.min(l.minutesAgo, 30)),
    };
    await repos.incidents.save(Incident.fromSnapshot(snap));
    const r = { ...reporter, role: Role.EMPLOYEE };
    await audit(id, created, r, 'INCIDENT_CREATED', `${id} created by ${reporter.name}: "${l.t.title}"`, null, IncidentStatus.NEW);
    await audit(id, created, SYS, 'INCIDENT_CLASSIFIED', `Incident classified as ${l.t.cat}`, IncidentStatus.NEW, IncidentStatus.CLASSIFIED);
    await audit(id, created, SYS, 'PRIORITY_CALCULATED', `Priority calculated as ${b.priority} (score ${b.priorityScore})`, null, null);
    if (tech) await audit(id, addMinutes(created, 0.5), SYS, 'INCIDENT_ASSIGNED', `Assigned to technician ${tech.name} (${tech.id})`, IncidentStatus.CLASSIFIED, IncidentStatus.ASSIGNED);
    if (l.breached) {
      await audit(id, sla.responseDueAt, SYS, 'SLA_RESPONSE_BREACHED', `SLA violated: no response within ${sla.responseMinutes} min`, null, null);
      await audit(id, addMinutes(created, sla.responseMinutes * 3), SYS, 'INCIDENT_ESCALATED', 'Escalated to level 3 (IT Manager)', null, null);
      await audit(id, sla.resolutionDueAt, SYS, 'SLA_RESOLUTION_BREACHED', `SLA violated: not resolved within ${sla.resolutionMinutes} min`, null, null);
    }
  }

  return { users: userSpecs.length, services: SERVICES.length, categories: CATEGORIES.length, slaPolicies: policies.length, historicalIncidents: historical, liveIncidents: live.length };
}
