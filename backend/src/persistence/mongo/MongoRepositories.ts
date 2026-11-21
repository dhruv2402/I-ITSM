import { randomUUID } from 'crypto';
import { FilterQuery, Model } from 'mongoose';
import { AuditRecord, AuditSearchCriteria } from '../../domain/audit/AuditRecord';
import { Category, CategorySnapshot } from '../../domain/catalog/Category';
import { ItService, ItServiceSnapshot } from '../../domain/catalog/ItService';
import { SlaPolicy, SlaPolicySnapshot } from '../../domain/catalog/SlaPolicy';
import { ChannelType, Priority, Role } from '../../domain/enums';
import { DatabaseError } from '../../domain/errors';
import { Incident, IncidentSnapshot } from '../../domain/incident/Incident';
import { IncidentStates } from '../../domain/incident/IncidentState';
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
import {
  AuditModel,
  CategoryModel,
  CounterModel,
  IncidentModel,
  NotificationModel,
  ServiceModel,
  SettingModel,
  SlaPolicyModel,
  UserModel,
} from './schemas';

/** Wraps driver errors into the domain's DatabaseError so callers never see Mongo internals. */
async function guard<R>(op: string, fn: () => Promise<R>): Promise<R> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof DatabaseError) throw err;
    throw new DatabaseError(`Database operation failed (${op}): ${(err as Error).message}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromDoc = <S>(doc: any): S => {
  const { _id, ...rest } = doc;
  return { ...rest, id: _id } as S;
};

/** Generic MongoDB repository: subclasses only supply the domain <-> snapshot mapping. */
abstract class MongoRepository<T, S extends { id: string }> implements Repository<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(protected readonly model: Model<any>) {}

  protected abstract toDomain(s: S): T;
  protected abstract toSnapshot(e: T): S;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected map(doc: any): T {
    return this.toDomain(fromDoc<S>(doc));
  }

  findById(id: string): Promise<T | null> {
    return guard('findById', async () => {
      const d = await this.model.findById(id).lean();
      return d ? this.map(d) : null;
    });
  }

  findAll(): Promise<T[]> {
    return guard('findAll', async () => (await this.model.find().lean()).map((d) => this.map(d)));
  }

  save(entity: T): Promise<T> {
    return guard('save', async () => {
      const { id, ...rest } = this.toSnapshot(entity);
      await this.model.replaceOne({ _id: id }, { _id: id, ...rest }, { upsert: true });
      return entity;
    });
  }

  delete(id: string): Promise<boolean> {
    return guard('delete', async () => (await this.model.deleteOne({ _id: id })).deletedCount > 0);
  }
}

export class MongoUserRepository extends MongoRepository<User, UserSnapshot> implements UserRepository {
  constructor() {
    super(UserModel);
  }
  protected toDomain(s: UserSnapshot) {
    return UserFactory.create(s);
  }
  protected toSnapshot(e: User) {
    return e.toSnapshot();
  }
  findByEmail(email: string): Promise<User | null> {
    return guard('findByEmail', async () => {
      const d = await this.model.findOne({ email: email.toLowerCase() }).lean();
      return d ? this.map(d) : null;
    });
  }
  findByRoles(roles: Role[]): Promise<User[]> {
    return guard('findByRoles', async () => (await this.model.find({ role: { $in: roles } }).lean()).map((d) => this.map(d)));
  }
}

export class MongoIncidentRepository extends MongoRepository<Incident, IncidentSnapshot> implements IncidentRepository {
  constructor(private readonly sequences: SequenceGenerator) {
    super(IncidentModel);
  }
  protected toDomain(s: IncidentSnapshot) {
    return Incident.fromSnapshot(s);
  }
  protected toSnapshot(e: Incident) {
    return e.toSnapshot();
  }

  /**
   * Indexed fields are filtered by MongoDB; time-dependent rules (SLA status) and
   * free-text matching are then applied by the shared IncidentSpecification.
   */
  search(c: IncidentSearchCriteria): Promise<Page<Incident>> {
    return guard('search', async () => {
      const q: FilterQuery<unknown> = {};
      if (c.status?.length) q.status = { $in: c.status };
      if (c.priority?.length) q.priority = { $in: c.priority };
      if (c.categoryCode) q.categoryCode = c.categoryCode;
      if (c.serviceId) q.serviceId = c.serviceId;
      if (c.technicianId) q.assignedTechnicianId = c.technicianId;
      if (c.reporterId) q.reporterId = c.reporterId;
      if (c.createdFrom || c.createdTo) {
        q.createdAt = { ...(c.createdFrom ? { $gte: c.createdFrom } : {}), ...(c.createdTo ? { $lte: c.createdTo } : {}) };
      }
      if (c.activeOnly) q.status = { $in: IncidentStates.activeStatuses().filter((s) => !c.status?.length || c.status.includes(s)) };
      if (c.visibleTo) {
        q.$or = [{ reporterId: c.visibleTo.userId }, ...(c.visibleTo.includeAssigned ? [{ assignedTechnicianId: c.visibleTo.userId }] : [])];
      }
      const docs = await this.model.find(q).lean();
      return new IncidentSpecification(c).apply(docs.map((d) => this.map(d)));
    });
  }

  findActive(): Promise<Incident[]> {
    return guard('findActive', async () =>
      (await this.model.find({ status: { $in: IncidentStates.activeStatuses() } }).lean()).map((d) => this.map(d)),
    );
  }

  activeWorkload(): Promise<Map<string, number>> {
    return guard('activeWorkload', async () => {
      const rows: { _id: string; n: number }[] = await this.model.aggregate([
        { $match: { status: { $in: IncidentStates.activeStatuses() }, assignedTechnicianId: { $ne: null } } },
        { $group: { _id: '$assignedTechnicianId', n: { $sum: 1 } } },
      ]);
      return new Map(rows.map((r) => [r._id, r.n]));
    });
  }

  findSolved(limit = 500): Promise<Incident[]> {
    return guard('findSolved', async () =>
      (await this.model.find({ resolution: { $ne: null } }).sort({ createdAt: -1 }).limit(limit).lean()).map((d) => this.map(d)),
    );
  }

  async nextId(): Promise<string> {
    return `INC${await this.sequences.next('incident')}`;
  }
}

export class MongoServiceRepository extends MongoRepository<ItService, ItServiceSnapshot> implements ServiceRepository {
  constructor() {
    super(ServiceModel);
  }
  protected toDomain(s: ItServiceSnapshot) {
    return ItService.create(s);
  }
  protected toSnapshot(e: ItService) {
    return e.toSnapshot();
  }
}

export class MongoCategoryRepository extends MongoRepository<Category, CategorySnapshot> implements CategoryRepository {
  constructor() {
    super(CategoryModel);
  }
  protected toDomain(s: CategorySnapshot) {
    return Category.create(s);
  }
  protected toSnapshot(e: Category) {
    return e.toSnapshot();
  }
}

export class MongoSlaPolicyRepository extends MongoRepository<SlaPolicy, SlaPolicySnapshot> implements SlaPolicyRepository {
  constructor() {
    super(SlaPolicyModel);
  }
  protected toDomain(s: SlaPolicySnapshot) {
    return SlaPolicy.create(s);
  }
  protected toSnapshot(e: SlaPolicy) {
    return e.toSnapshot();
  }
  findFor(priority: Priority, serviceId: string | null): Promise<SlaPolicy | null> {
    return guard('findFor', async () => {
      const d = await this.model.findOne({ priority, serviceId, active: true }).lean();
      return d ? this.map(d) : null;
    });
  }
}

export class MongoAuditRepository implements AuditRepository {
  append(r: AuditRecord): Promise<void> {
    return guard('audit.append', async () => {
      const { id, ...rest } = r;
      await AuditModel.create({ _id: id || randomUUID(), ...rest });
    });
  }
  search(c: AuditSearchCriteria): Promise<AuditRecord[]> {
    return guard('audit.search', async () => {
      const q: FilterQuery<unknown> = {};
      if (c.incidentId) q.incidentId = c.incidentId;
      if (c.userId) q.userId = c.userId;
      if (c.action) q.action = c.action;
      if (c.from || c.to) q.timestamp = { ...(c.from ? { $gte: c.from } : {}), ...(c.to ? { $lte: c.to } : {}) };
      const docs = await AuditModel.find(q)
        .sort({ timestamp: c.incidentId ? 1 : -1 })
        .limit(c.limit ?? 500)
        .lean();
      return docs.map((d) => fromDoc<AuditRecord>(d));
    });
  }
}

export class MongoNotificationRepository implements NotificationRepository {
  save(n: NotificationRecord): Promise<void> {
    return guard('notification.save', async () => {
      const { id, ...rest } = n;
      await NotificationModel.create({ _id: id, ...rest });
    });
  }
  findForUser(userId: string, opts: { unreadOnly?: boolean; limit?: number } = {}): Promise<NotificationRecord[]> {
    return guard('notification.findForUser', async () => {
      const q: FilterQuery<unknown> = { userId, channel: ChannelType.IN_APP };
      if (opts.unreadOnly) q.read = false;
      const docs = await NotificationModel.find(q).sort({ createdAt: -1 }).limit(opts.limit ?? 50).lean();
      return docs.map((d) => fromDoc<NotificationRecord>(d));
    });
  }
  findRecent(limit: number): Promise<NotificationRecord[]> {
    return guard('notification.findRecent', async () =>
      (await NotificationModel.find().sort({ createdAt: -1 }).limit(limit).lean()).map((d) => fromDoc<NotificationRecord>(d)),
    );
  }
  markRead(id: string, userId: string): Promise<boolean> {
    return guard('notification.markRead', async () => (await NotificationModel.updateOne({ _id: id, userId }, { read: true })).modifiedCount > 0);
  }
  markAllRead(userId: string): Promise<number> {
    return guard('notification.markAllRead', async () => (await NotificationModel.updateMany({ userId, read: false }, { read: true })).modifiedCount);
  }
}

export class MongoSettingsRepository implements SettingsRepository {
  get(key: string): Promise<string | null> {
    return guard('settings.get', async () => {
      const d = await SettingModel.findById(key).lean<{ value: string }>();
      return d?.value ?? null;
    });
  }
  set(key: string, value: string): Promise<void> {
    return guard('settings.set', async () => {
      await SettingModel.updateOne({ _id: key }, { value }, { upsert: true });
    });
  }
}

export class MongoSequenceGenerator implements SequenceGenerator {
  next(name: string): Promise<number> {
    return guard('sequence.next', async () => {
      await CounterModel.updateOne({ _id: name }, { $setOnInsert: { seq: 1000 } }, { upsert: true });
      const d = await CounterModel.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { new: true }).lean<{ seq: number }>();
      return d!.seq;
    });
  }
}

export function createMongoRepositories(): Repositories {
  const sequences = new MongoSequenceGenerator();
  return {
    kind: 'mongo',
    users: new MongoUserRepository(),
    incidents: new MongoIncidentRepository(sequences),
    services: new MongoServiceRepository(),
    categories: new MongoCategoryRepository(),
    slaPolicies: new MongoSlaPolicyRepository(),
    audit: new MongoAuditRepository(),
    notifications: new MongoNotificationRepository(),
    settings: new MongoSettingsRepository(),
    sequences,
  };
}
