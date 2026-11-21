import { Permission } from '../domain/enums';
import { AuthorizationError } from '../domain/errors';
import { EventType } from '../domain/events/DomainEvent';
import { EventBus } from '../domain/events/EventBus';
import { User } from '../domain/user/User';
import { SettingsRepository } from '../persistence/repositories';
import { clock } from '../shared/clock';
import { AssignmentStrategyRegistry } from '../strategies/assignment/AssignmentStrategyRegistry';
import { PriorityCalculator } from '../strategies/priority/PriorityCalculator';

const KEYS = { assignment: 'assignmentStrategy', priority: 'priorityStrategy' };

/** Runtime-configurable behaviour (which assignment / priority strategy is active), persisted in the DB. */
export class SettingsService {
  constructor(
    private readonly repo: SettingsRepository,
    private readonly assignment: AssignmentStrategyRegistry,
    private readonly priority: PriorityCalculator,
    private readonly bus: EventBus,
  ) {}

  async load(): Promise<void> {
    const a = await this.repo.get(KEYS.assignment);
    const p = await this.repo.get(KEYS.priority);
    try {
      if (a) this.assignment.use(a);
      if (p) this.priority.use(p);
    } catch (err) {
      console.warn('[settings] ignoring invalid stored setting:', (err as Error).message);
    }
  }

  current() {
    return { assignmentStrategies: this.assignment.list(), priorityStrategies: this.priority.list() };
  }

  async update(actor: User, changes: { assignmentStrategy?: string; priorityStrategy?: string }) {
    if (!actor.hasPermission(Permission.CONFIG_MANAGE)) throw new AuthorizationError('Only administrators can change system settings');
    if (changes.assignmentStrategy) {
      this.assignment.use(changes.assignmentStrategy);
      await this.repo.set(KEYS.assignment, changes.assignmentStrategy);
    }
    if (changes.priorityStrategy) {
      this.priority.use(changes.priorityStrategy);
      await this.repo.set(KEYS.priority, changes.priorityStrategy);
    }
    await this.bus.publish({
      type: EventType.CONFIG_CHANGED,
      actor: actor.toActor(),
      occurredAt: clock.now(),
      description: `Strategy settings changed: ${JSON.stringify(changes)}`,
    });
    return this.current();
  }
}
