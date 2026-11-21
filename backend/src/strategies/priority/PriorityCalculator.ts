import { ValidationError } from '../../domain/errors';
import { PriorityAssessment } from '../../domain/incident/Incident';
import { MatrixPriorityStrategy } from './MatrixPriorityStrategy';
import { PriorityInput, PriorityStrategy } from './PriorityStrategy';
import { WeightedPriorityStrategy } from './WeightedPriorityStrategy';

/** Strategy context: holds the available algorithms and the one currently selected by the admin. */
export class PriorityCalculator {
  private readonly strategies = new Map<string, PriorityStrategy>();
  private activeKey: string;

  constructor(strategies: PriorityStrategy[] = [new WeightedPriorityStrategy(), new MatrixPriorityStrategy()]) {
    strategies.forEach((s) => this.strategies.set(s.key, s));
    this.activeKey = strategies[0].key;
  }

  register(strategy: PriorityStrategy): void {
    this.strategies.set(strategy.key, strategy);
  }

  use(key: string): void {
    if (!this.strategies.has(key)) throw new ValidationError(`Unknown priority strategy ${key}`);
    this.activeKey = key;
  }

  get active(): PriorityStrategy {
    return this.strategies.get(this.activeKey)!;
  }

  list(): { key: string; name: string; description: string; active: boolean }[] {
    return [...this.strategies.values()].map((s) => ({ key: s.key, name: s.name, description: s.description, active: s.key === this.activeKey }));
  }

  calculate(input: PriorityInput): PriorityAssessment {
    return this.active.calculate(input);
  }
}
