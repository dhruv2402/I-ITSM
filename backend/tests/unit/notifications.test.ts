import { buildContainer } from '../../src/container';
import { ChannelType } from '../../src/domain/enums';
import { EmailGateway, EmailMessage } from '../../src/notification/adapters/EmailGateway';
import { createInMemoryRepositories } from '../../src/persistence/memory/InMemoryRepositories';
import { seedDatabase } from '../../src/seed/seedData';
import { SECRET, userByEmail } from '../helpers';

/** E-mail provider that takes a long time (like an SMTP server behind a blocked port). */
class SlowEmailGateway implements EmailGateway {
  readonly provider = 'slow test gateway';
  readonly isSimulated = false;
  sent: EmailMessage[] = [];
  constructor(private readonly delayMs: number) {}
  async send(message: EmailMessage): Promise<void> {
    await new Promise((r) => setTimeout(r, this.delayMs));
    this.sent.push(message);
  }
}

describe('Notifications never block the user (TC31)', () => {
  test('a slow e-mail provider does not delay incident creation; in-app is immediate, e-mail is logged later', async () => {
    const gateway = new SlowEmailGateway(1500);
    const c = buildContainer({ repos: createInMemoryRepositories(), email: gateway, jwtSecret: SECRET, tokenTtlSeconds: 3600 });
    await seedDatabase(c);
    const employee = await userByEmail(c, 'rohan@itsm.demo');

    const started = Date.now();
    const { incident } = await c.incidents.create(employee, {
      title: 'Payroll page shows blank screen',
      description: 'The HR payroll page loads a blank white screen for everyone in finance.',
      serviceId: 'SVC-HR',
      impact: 2,
      urgency: 3,
      affectedUsers: 20,
    });
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(1000); // did not wait for the 1.5 s e-mail

    const inbox = await c.repos.notifications.findForUser(employee.id);
    expect(inbox.some((n) => n.incidentId === incident.id && n.channel === ChannelType.IN_APP)).toBe(true);
    expect(gateway.sent).toHaveLength(0); // still being delivered in the background

    await c.notifications.flush();
    expect(gateway.sent.length).toBeGreaterThan(0);
    const log = await c.repos.notifications.findRecent(100);
    expect(log.some((n) => n.channel === ChannelType.EMAIL && n.incidentId === incident.id && n.status === 'SENT')).toBe(true);
  });

  test('a failing e-mail provider is recorded as FAILED without breaking the request', async () => {
    const failing: EmailGateway = {
      provider: 'failing',
      isSimulated: false,
      send: async () => {
        throw new Error('connection timeout');
      },
    };
    const c = buildContainer({ repos: createInMemoryRepositories(), email: failing, jwtSecret: SECRET, tokenTtlSeconds: 3600 });
    await seedDatabase(c);
    const employee = await userByEmail(c, 'priya@itsm.demo');
    const { incident } = await c.incidents.create(employee, {
      title: 'Cannot open shared calendar',
      description: 'Outlook shows an error when opening the team shared calendar.',
      serviceId: 'SVC-EMAIL',
      impact: 1,
      urgency: 2,
      affectedUsers: 4,
    });
    await c.notifications.flush();
    const log = await c.repos.notifications.findRecent(100);
    const email = log.find((n) => n.channel === ChannelType.EMAIL && n.incidentId === incident.id);
    expect(email?.status).toBe('FAILED');
    expect(email?.error).toMatch(/connection timeout/);
  });
});
