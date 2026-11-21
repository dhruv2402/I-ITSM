import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { buildContainer } from '../../src/container';
import { IncidentStatus } from '../../src/domain/enums';
import { createMongoRepositories } from '../../src/persistence/mongo/MongoRepositories';
import { seedDatabase } from '../../src/seed/seedData';
import { SECRET } from '../helpers';

/**
 * Runs the MongoDB repositories against a real (in-process) mongod to verify
 * the persistence mapping. Skipped automatically if the mongod binary cannot be downloaded.
 */
describe('MongoDB repositories', () => {
  let server: MongoMemoryServer | null = null;

  beforeAll(async () => {
    try {
      server = await MongoMemoryServer.create();
      await mongoose.connect(server.getUri(), { dbName: 'itsm_test' });
    } catch (e) {
      console.warn('Skipping MongoDB tests:', (e as Error).message);
      server = null;
    }
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await server?.stop();
  });

  test('TC19 seed, search, workload aggregation and persistence round-trip', async () => {
    if (!server) return;
    const repos = createMongoRepositories();
    const c = buildContainer({ repos, jwtSecret: SECRET, tokenTtlSeconds: 3600 });
    await seedDatabase(c);
    const inc = await repos.incidents.findById('INC1037');
    expect(inc!.title).toBe('Payment application unavailable');
    expect(inc!.slaTracker!.responseDueAt).toBeInstanceOf(Date);
    const page = await repos.incidents.search({ status: [IncidentStatus.CLOSED], serviceId: 'SVC-PAY' });
    expect(page.total).toBeGreaterThan(0);
    const workload = await repos.incidents.activeWorkload();
    expect(workload.get('T1003')).toBe(2);
    expect(await repos.incidents.nextId()).toBe('INC1046');
    const user = await repos.users.findByEmail('ADMIN@itsm.demo');
    expect(user!.title).toBe('System Administrator');
    expect((await repos.audit.search({ incidentId: 'INC1037' })).length).toBeGreaterThan(0);
  });
});
