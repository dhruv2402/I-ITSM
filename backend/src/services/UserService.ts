import { Permission, Role } from '../domain/enums';
import { AuthorizationError, ConflictError, UserNotFoundError, ValidationError } from '../domain/errors';
import { EventType } from '../domain/events/DomainEvent';
import { EventBus } from '../domain/events/EventBus';
import { Technician } from '../domain/user/Technician';
import { User } from '../domain/user/User';
import { isTechnician, UserFactory } from '../domain/user/UserFactory';
import { IncidentRepository, SequenceGenerator, UserRepository } from '../persistence/repositories';
import { clock } from '../shared/clock';
import { AuthService, validatePassword } from './AuthService';

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: Role;
  phone?: string;
  department?: string;
  skills?: string[];
  maxWorkload?: number;
  experienceYears?: number;
}

/** User & technician management (administrator use cases). */
export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly incidents: IncidentRepository,
    private readonly sequences: SequenceGenerator,
    private readonly bus: EventBus,
  ) {}

  private requireAdmin(actor: User): void {
    if (!actor.hasPermission(Permission.USER_MANAGE)) throw new AuthorizationError('Only administrators can manage users');
  }

  async get(id: string): Promise<User> {
    const u = await this.users.findById(id);
    if (!u) throw new UserNotFoundError(id);
    return u;
  }

  async list(actor: User, role?: Role): Promise<User[]> {
    if (!actor.hasPermission(Permission.USER_MANAGE) && !actor.hasPermission(Permission.INCIDENT_ASSIGN)) {
      throw new AuthorizationError('Not allowed to list users');
    }
    const all = role ? await this.users.findByRoles([role]) : await this.users.findAll();
    return all.sort((a, b) => a.id.localeCompare(b.id));
  }

  async create(actor: User, input: CreateUserInput): Promise<User> {
    this.requireAdmin(actor);
    validatePassword(input.password);
    if (await this.users.findByEmail(input.email)) throw new ConflictError('An account with this e-mail already exists');
    const id = `${UserFactory.idPrefix(input.role)}${await this.sequences.next(`user-${UserFactory.idPrefix(input.role)}`)}`;
    const user = UserFactory.create({
      id,
      name: input.name,
      email: input.email,
      passwordHash: await AuthService.hash(input.password),
      role: input.role,
      phone: input.phone,
      department: input.department,
      active: true,
      createdAt: clock.now(),
      skills: input.skills,
      maxWorkload: input.maxWorkload,
      experienceYears: input.experienceYears,
      available: true,
    });
    await this.users.save(user);
    await this.audit(actor, EventType.USER_CREATED, `Created ${user.title} ${user.name} (${user.id})`);
    return user;
  }

  async update(
    actor: User,
    id: string,
    changes: { name?: string; phone?: string; department?: string; role?: Role; active?: boolean; skills?: string[]; maxWorkload?: number; experienceYears?: number; available?: boolean },
  ): Promise<User> {
    this.requireAdmin(actor);
    let user = await this.get(id);
    if (changes.active === false && user.id === actor.id) throw new ValidationError('You cannot deactivate your own account');
    if (changes.role && changes.role !== user.role) {
      if (user.id === actor.id) throw new ValidationError('You cannot change your own role');
      // a role change means a different class -> rebuild through the factory
      user = UserFactory.create({ ...user.toSnapshot(), role: changes.role });
    }
    user.updateProfile(changes);
    if (changes.active === true) user.activate();
    if (changes.active === false) user.deactivate();
    if (user instanceof Technician) {
      user.updateTechnicalProfile({ skills: changes.skills, maxWorkload: changes.maxWorkload, experienceYears: changes.experienceYears });
      if (changes.available !== undefined) user.setAvailability(changes.available);
    }
    await this.users.save(user);
    await this.audit(actor, EventType.USER_UPDATED, `Updated ${user.name} (${user.id}): ${Object.keys(changes).join(', ')}`);
    return user;
  }

  async resetPassword(actor: User, id: string, password: string): Promise<void> {
    this.requireAdmin(actor);
    validatePassword(password);
    const user = await this.get(id);
    user.changePasswordHash(await AuthService.hash(password));
    await this.users.save(user);
    await this.audit(actor, EventType.USER_UPDATED, `Password reset for ${user.name} (${user.id})`);
  }

  /** Technician toggles their own availability (e.g. on leave / back). */
  async setMyAvailability(actor: User, available: boolean): Promise<User> {
    if (!isTechnician(actor)) throw new AuthorizationError('Only technicians have an availability status');
    actor.setAvailability(available);
    await this.users.save(actor);
    await this.audit(actor, EventType.USER_UPDATED, `${actor.name} set availability to ${available ? 'AVAILABLE' : 'UNAVAILABLE'}`);
    return actor;
  }

  async technicians(): Promise<{ technician: Technician; activeWorkload: number }[]> {
    const workload = await this.incidents.activeWorkload();
    const techs = (await this.users.findByRoles([Role.TECHNICIAN, Role.TEAM_LEAD])).filter(isTechnician);
    return techs.map((t) => ({ technician: t, activeWorkload: workload.get(t.id) ?? 0 })).sort((a, b) => a.technician.id.localeCompare(b.technician.id));
  }

  private audit(actor: User, type: EventType, description: string): Promise<void> {
    return this.bus.publish({ type, actor: actor.toActor(), occurredAt: clock.now(), description });
  }
}
