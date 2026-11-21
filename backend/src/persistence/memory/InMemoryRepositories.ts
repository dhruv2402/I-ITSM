import { AuditRecord, AuditSearchCriteria } from '../../domain/audit/AuditRecord';
import { Category, CategorySnapshot } from '../../domain/catalog/Category';
import { ItService, ItServiceSnapshot } from '../../domain/catalog/ItService';
import { SlaPolicy, SlaPolicySnapshot } from '../../domain/catalog/SlaPolicy';
import { ChannelType, Priority, Role } from '../../domain/enums';
import { Incident, IncidentSnapshot } from '../../domain/incident/Incident';
import { NotificationRecord } from '../../domain/notification/Notification';
import { User, UserSnapshot } from '../../domain/user/User';
import { UserFactory } from '../../domain/user/UserFactory';
import { IncidentSpecification } from '../IncidentSpecification';
import {
  AuditRepository,
  CategoryRepository,
  IncidentRepository,
  IncidentSearchCriteria,
  NotificationRepository,
  Page,
  Repositories,
  Repository,
  SequenceGenerator,
  ServiceRepository,
  SettingsRepository,
  SlaPolicyRepository,
  UserRepository,
} from '../repositories';

/**
 * Generic in-memory repository. Stores deep-copied snapshots (never the live
 * objects) so it behaves like a real database: changes are only visible after save().
 */
abstract class InMemoryRepository<T, S extends { id: string }> implements Repository<T> {
  protected readonly rows = new Map<string, S>();

  protected abstract toDomain(s: S): T;
  protected abstract toSnapshot(e: T): S;

  async findById(id: string): Promise<T | null> {
    const s = this.rows.get(id);
    return s ? this.toDomain(structuredClone(s)) : null;
  }

  async findAll(): Promise<T[]> {
    return [...this.rows.values()].map((s) => this.toDomain(structuredClone(s)));
  }

  async save(entity: T): Promise<T> {
    const s = this.toSnapshot(entity);
    this.rows.set(s.id, structuredClone(s));
    return entity;
  }

  async delete(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }
}

export class InMemoryUserRepository extends InMemoryRepository<User, UserSnapshot> implements UserRepository {
  protected toDomain(s: UserSnapshot): User {
    return UserFactory.create(s);
  }
  protected toSnapshot(e: User): UserSnapshot {
    return e.toSnapshot();
  }
  async findByEmail(email: string): Promise<User | null> {
    const s = [...this.rows.values()].find((u) => u.email.toLowerCase() === email.toLowerCase());
    return s ? this.toDomain(structuredClone(s)) : null;
  }
  async findByRoles(roles: Role[]): Promise<User[]> {
    return [...this.rows.values()].filter((u) => roles.includes(u.role)).map((s) => this.toDomain(structuredClone(s)));
  }
}

export class InMemoryIncidentRepository extends InMemoryRepository<Incident, IncidentSnapshot> implements IncidentRepository {
  private seq = 1000;
  protected toDomain(s: IncidentSnapshot): Incident {
    return Incident.fromSnapshot(s);
  }
  protected toSnapshot(e: Incident): IncidentSnapshot {
    return e.toSnapshot();
  }
  async search(criteria: IncidentSearchCriteria): Promise<Page<Incident>> {
    return new IncidentSpecification(criteria).apply(await this.findAll());
  }
  async findActive(): Promise<Incident[]> {
    return (await this.findAll()).filter((i) => i.isActive());
  }
  async activeWorkload(): Promise<Map<string, number>> {
    const m = new Map<string, number>();
    (await this.findActive()).forEach((i) => {
      if (i.assignedTechnicianId) m.set(i.assignedTechnicianId, (m.get(i.assignedTechnicianId) ?? 0) + 1);
    });
    return m;
  }
  async findSolved(limit = 500): Promise<Incident[]> {
    return (await this.findAll())
      .filter((i) => i.resolution !== null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
  async nextId(): Promise<string> {
    do {
      this.seq += 1;
    } while (this.rows.has(`INC${this.seq}`));
    return `INC${this.seq}`;
  }
}

export class InMemoryServiceRepository extends InMemoryRepository<ItService, ItServiceSnapshot> implements ServiceRepository {
  protected toDomain(s: ItServiceSnapshot) {
    return ItService.create(s);
  }
  protected toSnapshot(e: ItService) {
    return e.toSnapshot();
  }
}

export class InMemoryCategoryRepository extends InMemoryRepository<Category, CategorySnapshot> implements CategoryRepository {
  protected toDomain(s: CategorySnapshot) {
    return Category.create(s);
  }
  protected toSnapshot(e: Category) {
    return e.toSnapshot();
  }
}

export class InMemorySlaPolicyRepository extends InMemoryRepository<SlaPolicy, SlaPolicySnapshot> implements SlaPolicyRepository {
  protected toDomain(s: SlaPolicySnapshot) {
    return SlaPolicy.create(s);
  }
  protected toSnapshot(e: SlaPolicy) {
    return e.toSnapshot();
  }
  async findFor(priority: Priority, serviceId: string | null): Promise<SlaPolicy | null> {
    const s = [...this.rows.values()].find((p) => p.active && p.priority === priority && p.serviceId === serviceId);
    return s ? this.toDomain(structuredClone(s)) : null;
  }
}

export class InMemoryAuditRepository implements AuditRepository {
  private readonly records: AuditRecord[] = [];
  async append(record: AuditRecord): Promise<void> {
    this.records.push(structuredClone(record));
  }
  async search(c: AuditSearchCriteria): Promise<AuditRecord[]> {
    return this.records
      .filter(
        (r) =>
          (!c.incidentId || r.incidentId === c.incidentId) &&
          (!c.userId || r.userId === c.userId) &&
          (!c.action || r.action === c.action) &&
          (!c.from || r.timestamp >= c.from) &&
          (!c.to || r.timestamp <= c.to),
      )
      .sort((a, b) => (c.incidentId ? a.timestamp.getTime() - b.timestamp.getTime() : b.timestamp.getTime() - a.timestamp.getTime()))
      .slice(0, c.limit ?? 500)
      .map((r) => structuredClone(r));
  }
}

export class InMemoryNotificationRepository implements NotificationRepository {
  private readonly items: NotificationRecord[] = [];
  async save(n: NotificationRecord): Promise<void> {
    this.items.push(structuredClone(n));
  }
  async findForUser(userId: string, opts: { unreadOnly?: boolean; limit?: number } = {}): Promise<NotificationRecord[]> {
    return this.items
      .filter((n) => n.userId === userId && n.channel === ChannelType.IN_APP && (!opts.unreadOnly || !n.read))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, opts.limit ?? 50)
      .map((n) => structuredClone(n));
  }
  async findRecent(limit: number): Promise<NotificationRecord[]> {
    return [...this.items].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit).map((n) => structuredClone(n));
  }
  async markRead(id: string, userId: string): Promise<boolean> {
    const n = this.items.find((x) => x.id === id && x.userId === userId);
    if (!n) return false;
    n.read = true;
    return true;
  }
  async markAllRead(userId: string): Promise<number> {
    let count = 0;
    this.items.forEach((n) => {
      if (n.userId === userId && !n.read) {
        n.read = true;
        count++;
      }
    });
    return count;
  }
}

export class InMemorySettingsRepository implements SettingsRepository {
  private readonly values = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

export class InMemorySequenceGenerator implements SequenceGenerator {
  private readonly counters = new Map<string, number>();
  async next(name: string): Promise<number> {
    const v = (this.counters.get(name) ?? 1000) + 1;
    this.counters.set(name, v);
    return v;
  }
}

export function createInMemoryRepositories(): Repositories {
  return {
    kind: 'memory',
    users: new InMemoryUserRepository(),
    incidents: new InMemoryIncidentRepository(),
    services: new InMemoryServiceRepository(),
    categories: new InMemoryCategoryRepository(),
    slaPolicies: new InMemorySlaPolicyRepository(),
    audit: new InMemoryAuditRepository(),
    notifications: new InMemoryNotificationRepository(),
    settings: new InMemorySettingsRepository(),
    sequences: new InMemorySequenceGenerator(),
  };
}
