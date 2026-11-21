import { randomUUID } from 'crypto';
import { Category, CategorySnapshot } from '../domain/catalog/Category';
import { ItService, ItServiceSnapshot } from '../domain/catalog/ItService';
import { SlaPolicy, SlaPolicySnapshot } from '../domain/catalog/SlaPolicy';
import { Permission } from '../domain/enums';
import { AuthorizationError, ConflictError, NotFoundError, ServiceNotFoundError, ValidationError } from '../domain/errors';
import { EventType } from '../domain/events/DomainEvent';
import { EventBus } from '../domain/events/EventBus';
import { User } from '../domain/user/User';
import { CategoryRepository, ServiceRepository, SlaPolicyRepository } from '../persistence/repositories';
import { clock } from '../shared/clock';

/** Administration of IT services, incident categories and SLA policies. */
export class CatalogService {
  constructor(
    private readonly services: ServiceRepository,
    private readonly categories: CategoryRepository,
    private readonly slaPolicies: SlaPolicyRepository,
    private readonly bus: EventBus,
  ) {}

  private requireConfig(actor: User): void {
    if (!actor.hasPermission(Permission.CONFIG_MANAGE)) throw new AuthorizationError('Only administrators can change the configuration');
  }

  private audit(actor: User, description: string): Promise<void> {
    return this.bus.publish({ type: EventType.CONFIG_CHANGED, actor: actor.toActor(), occurredAt: clock.now(), description });
  }

  // ------------------------------------------------------------ IT services
  listServices(): Promise<ItService[]> {
    return this.services.findAll().then((l) => l.sort((a, b) => a.name.localeCompare(b.name)));
  }

  async getService(id: string): Promise<ItService> {
    const s = await this.services.findById(id);
    if (!s) throw new ServiceNotFoundError(id);
    return s;
  }

  private async checkDependencies(ids: string[]): Promise<void> {
    for (const d of ids) if (!(await this.services.findById(d))) throw new ServiceNotFoundError(d);
  }

  async createService(actor: User, input: ItServiceSnapshot): Promise<ItService> {
    this.requireConfig(actor);
    const id = input.id.toUpperCase();
    if (await this.services.findById(id)) throw new ConflictError(`Service ${id} already exists`);
    await this.checkDependencies(input.dependsOn ?? []);
    const s = ItService.create({ ...input, id, active: input.active ?? true, dependsOn: input.dependsOn ?? [] });
    await this.services.save(s);
    await this.audit(actor, `Created IT service ${s.name} (${s.id})`);
    return s;
  }

  async updateService(actor: User, id: string, changes: Partial<Omit<ItServiceSnapshot, 'id'>>): Promise<ItService> {
    this.requireConfig(actor);
    const s = await this.getService(id);
    if (changes.dependsOn) await this.checkDependencies(changes.dependsOn);
    s.update(changes);
    await this.services.save(s);
    await this.audit(actor, `Updated IT service ${s.id}: ${Object.keys(changes).join(', ')}`);
    return s;
  }

  // ------------------------------------------------------------ categories
  listCategories(): Promise<Category[]> {
    return this.categories.findAll().then((l) => l.sort((a, b) => a.name.localeCompare(b.name)));
  }

  async createCategory(actor: User, input: CategorySnapshot): Promise<Category> {
    this.requireConfig(actor);
    const code = input.id.toUpperCase();
    if (await this.categories.findById(code)) throw new ConflictError(`Category ${code} already exists`);
    const c = Category.create({ ...input, id: code, active: input.active ?? true, keywords: input.keywords ?? [] });
    await this.categories.save(c);
    await this.audit(actor, `Created incident category ${c.code}`);
    return c;
  }

  async updateCategory(actor: User, code: string, changes: Partial<Omit<CategorySnapshot, 'id'>>): Promise<Category> {
    this.requireConfig(actor);
    const c = await this.categories.findById(code.toUpperCase());
    if (!c) throw new NotFoundError(`Category ${code} does not exist`);
    c.update(changes);
    await this.categories.save(c);
    await this.audit(actor, `Updated incident category ${c.code}`);
    return c;
  }

  // ------------------------------------------------------------ SLA policies
  listSlaPolicies(): Promise<SlaPolicy[]> {
    return this.slaPolicies.findAll().then((l) => l.sort((a, b) => (a.serviceId ?? '').localeCompare(b.serviceId ?? '') || a.priority.localeCompare(b.priority)));
  }

  private async assertUnique(p: SlaPolicy): Promise<void> {
    if (!p.isActive) return;
    const existing = await this.slaPolicies.findFor(p.priority, p.serviceId);
    if (existing && existing.id !== p.id) {
      throw new ConflictError(`An active SLA policy for ${p.priority}${p.serviceId ? ` on ${p.serviceId}` : ' (default)'} already exists: ${existing.name}`);
    }
  }

  async createSlaPolicy(actor: User, input: Omit<SlaPolicySnapshot, 'id'>): Promise<SlaPolicy> {
    this.requireConfig(actor);
    if (input.serviceId) await this.getService(input.serviceId);
    const p = SlaPolicy.create({ ...input, id: `SLA-${randomUUID().slice(0, 8).toUpperCase()}`, active: input.active ?? true });
    await this.assertUnique(p);
    await this.slaPolicies.save(p);
    await this.audit(actor, `Created SLA policy ${p.name}: ${p.priority} respond ${p.responseMinutes}m / resolve ${p.resolutionMinutes}m`);
    return p;
  }

  async updateSlaPolicy(actor: User, id: string, changes: Partial<Omit<SlaPolicySnapshot, 'id'>>): Promise<SlaPolicy> {
    this.requireConfig(actor);
    const p = await this.slaPolicies.findById(id);
    if (!p) throw new NotFoundError(`SLA policy ${id} does not exist`);
    if (changes.serviceId) await this.getService(changes.serviceId);
    p.update(changes);
    await this.assertUnique(p);
    await this.slaPolicies.save(p);
    await this.audit(actor, `Updated SLA policy ${p.name}: respond ${p.responseMinutes}m / resolve ${p.resolutionMinutes}m`);
    return p;
  }

  async deleteSlaPolicy(actor: User, id: string): Promise<void> {
    this.requireConfig(actor);
    const p = await this.slaPolicies.findById(id);
    if (!p) throw new NotFoundError(`SLA policy ${id} does not exist`);
    if (p.isDefault) throw new ValidationError('Default SLA policies cannot be deleted; edit or deactivate them instead');
    await this.slaPolicies.delete(id);
    await this.audit(actor, `Deleted SLA policy ${p.name}`);
  }
}
