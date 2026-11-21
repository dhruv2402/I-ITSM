import { buildContainer, Container } from '../src/container';
import { ConsoleEmailAdapter } from '../src/notification/adapters/EmailGateway';
import { SimulatedSmsGateway } from '../src/notification/adapters/SmsGateway';
import { createInMemoryRepositories } from '../src/persistence/memory/InMemoryRepositories';
import { seedDatabase } from '../src/seed/seedData';
import { Role } from '../src/domain/enums';
import { UserFactory } from '../src/domain/user/UserFactory';
import { User } from '../src/domain/user/User';

process.env.NODE_ENV = 'test';

export const SECRET = 'test-secret';

export function emptyContainer() {
  const email = new ConsoleEmailAdapter();
  const sms = new SimulatedSmsGateway();
  const c = buildContainer({ repos: createInMemoryRepositories(), email, sms, jwtSecret: SECRET, tokenTtlSeconds: 3600 });
  return { c, email, sms };
}

export async function seededContainer(): Promise<{ c: Container; email: ConsoleEmailAdapter; sms: SimulatedSmsGateway }> {
  const ctx = emptyContainer();
  await seedDatabase(ctx.c);
  await ctx.c.incidents.retrainClassifier();
  return ctx;
}

export async function userByEmail(c: Container, email: string): Promise<User> {
  const u = await c.repos.users.findByEmail(email);
  if (!u) throw new Error(`seed user ${email} missing`);
  return u;
}

let n = 0;
export function makeUser(role: Role, extras: Record<string, unknown> = {}): User {
  n++;
  return UserFactory.create({
    id: `X${n}`,
    name: `Test ${role} ${n}`,
    email: `t${n}@test.io`,
    passwordHash: 'hash',
    role,
    active: true,
    createdAt: new Date(),
    ...extras,
  });
}
