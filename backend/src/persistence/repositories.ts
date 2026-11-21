import { AuditRecord, AuditSearchCriteria } from '../domain/audit/AuditRecord';
import { Category } from '../domain/catalog/Category';
import { ItService } from '../domain/catalog/ItService';
import { SlaPolicy } from '../domain/catalog/SlaPolicy';
import { IncidentStatus, Priority, Role, SlaStatus } from '../domain/enums';
import { Incident } from '../domain/incident/Incident';
import { NotificationRecord } from '../domain/notification/Notification';
import { User } from '../domain/user/User';

/**
 * Repository pattern: the business layer depends only on these interfaces.
 * Two implementations exist - MongoDB (production) and in-memory (tests,
 * offline demo) - and are chosen in one place (the composition root).
 */
export interface Repository<T> {
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  save(entity: T): Promise<T>;
  delete(id: string): Promise<boolean>;
}

export interface UserRepository extends Repository<User> {
  findByEmail(email: string): Promise<User | null>;
  findByRoles(roles: Role[]): Promise<User[]>;
}

export interface IncidentSearchCriteria {
  id?: string;
  text?: string;
  status?: IncidentStatus[];
  priority?: Priority[];
  categoryCode?: string;
  serviceId?: string;
  technicianId?: string;
  reporterId?: string;
  createdFrom?: Date;
  createdTo?: Date;
  slaStatus?: SlaStatus;
  escalated?: boolean;
  activeOnly?: boolean;
  /** Restricts results to incidents a user may see (reporter OR assignee). */
  visibleTo?: { userId: string; includeAssigned: boolean };
  sortBy?: 'createdAt' | 'priority' | 'updatedAt';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface IncidentRepository extends Repository<Incident> {
  search(criteria: IncidentSearchCriteria): Promise<Page<Incident>>;
  findActive(): Promise<Incident[]>;
  /** Map technicianId -> number of active incidents assigned. */
  activeWorkload(): Promise<Map<string, number>>;
  findSolved(limit?: number): Promise<Incident[]>;
  nextId(): Promise<string>;
}

export interface ServiceRepository extends Repository<ItService> {}
export interface CategoryRepository extends Repository<Category> {}

export interface SlaPolicyRepository extends Repository<SlaPolicy> {
  findFor(priority: Priority, serviceId: string | null): Promise<SlaPolicy | null>;
}

export interface AuditRepository {
  append(record: AuditRecord): Promise<void>;
  search(criteria: AuditSearchCriteria): Promise<AuditRecord[]>;
}

export interface NotificationRepository {
  save(n: NotificationRecord): Promise<void>;
  findForUser(userId: string, opts?: { unreadOnly?: boolean; limit?: number }): Promise<NotificationRecord[]>;
  findRecent(limit: number): Promise<NotificationRecord[]>;
  markRead(id: string, userId: string): Promise<boolean>;
  markAllRead(userId: string): Promise<number>;
}

export interface SettingsRepository {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface SequenceGenerator {
  next(name: string): Promise<number>;
}

/** Bundle of every repository - what the composition root hands to the services. */
export interface Repositories {
  users: UserRepository;
  incidents: IncidentRepository;
  services: ServiceRepository;
  categories: CategoryRepository;
  slaPolicies: SlaPolicyRepository;
  audit: AuditRepository;
  notifications: NotificationRepository;
  settings: SettingsRepository;
  sequences: SequenceGenerator;
  readonly kind: 'mongo' | 'memory';
}
