import { ValidationError } from '../../domain/errors';
import { AssignmentStrategy } from './AssignmentStrategy';
import { LoadBasedStrategy } from './LoadBasedStrategy';
import { RoundRobinStrategy } from './RoundRobinStrategy';
import { SkillBasedStrategy } from './SkillBasedStrategy';
import { SmartAssignmentStrategy } from './SmartAssignmentStrategy';

/**
 * Holds every available assignment strategy and the active one. The admin can
 * switch strategies at runtime; adding a new strategy = one new class + one
 * register() call, with no change to IncidentService.
 */
export class AssignmentStrategyRegistry {
  private readonly strategies = new Map<string, AssignmentStrategy>();
  private activeKey: string;

  constructor(
    strategies: AssignmentStrategy[] = [
      new SmartAssignmentStrategy(),
      new SkillBasedStrategy(),
      new LoadBasedStrategy(),
      new RoundRobinStrategy(),
    ],
  ) {
    strategies.forEach((s) => this.register(s));
    this.activeKey = strategies[0].key;
  }

  register(strategy: AssignmentStrategy): void {
    this.strategies.set(strategy.key, strategy);
  }

  get(key: string): AssignmentStrategy {
    const s = this.strategies.get(key);
    if (!s) throw new ValidationError(`Unknown assignment strategy ${key}`);
    return s;
  }

  use(key: string): void {
    this.get(key);
    this.activeKey = key;
  }

  get active(): AssignmentStrategy {
    return this.get(this.activeKey);
  }

  list(): { key: string; name: string; description: string; active: boolean }[] {
    return [...this.strategies.values()].map((s) => ({ key: s.key, name: s.name, description: s.description, active: s.key === this.activeKey }));
  }
}
