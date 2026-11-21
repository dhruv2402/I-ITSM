import { Priority } from '../../src/domain/enums';
import { MatrixPriorityStrategy } from '../../src/strategies/priority/MatrixPriorityStrategy';
import { PriorityCalculator } from '../../src/strategies/priority/PriorityCalculator';
import { affectedUsersLevel } from '../../src/strategies/priority/PriorityStrategy';
import { WeightedPriorityStrategy } from '../../src/strategies/priority/WeightedPriorityStrategy';

describe('Priority determination (Strategy pattern)', () => {
  const weighted = new WeightedPriorityStrategy();
  const matrix = new MatrixPriorityStrategy();

  test('TC01 payment outage affecting hundreds of users is P1 Critical', () => {
    const r = weighted.calculate({ impact: 4, urgency: 4, businessCriticality: 4, affectedUsers: 800, serviceUserBase: 2000 });
    expect(r.priority).toBe(Priority.P1);
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.rationale.length).toBeGreaterThan(0);
  });

  test('TC02 single-user low-urgency issue on a non-critical service is P4 Low', () => {
    const r = weighted.calculate({ impact: 1, urgency: 1, businessCriticality: 2, affectedUsers: 1, serviceUserBase: 1200 });
    expect(r.priority).toBe(Priority.P4);
  });

  test('TC03 boundary: matrix score exactly 36 is P1, 35 would not exist, 27 is P2, 8 is P3, 6 is P4', () => {
    expect(matrix.calculate({ impact: 3, urgency: 3, businessCriticality: 4, affectedUsers: 1, serviceUserBase: 0 }).priority).toBe(Priority.P1);
    expect(matrix.calculate({ impact: 3, urgency: 3, businessCriticality: 3, affectedUsers: 1, serviceUserBase: 0 }).priority).toBe(Priority.P2);
    expect(matrix.calculate({ impact: 2, urgency: 2, businessCriticality: 2, affectedUsers: 1, serviceUserBase: 0 }).priority).toBe(Priority.P3);
    expect(matrix.calculate({ impact: 1, urgency: 2, businessCriticality: 3, affectedUsers: 1, serviceUserBase: 0 }).priority).toBe(Priority.P4);
  });

  test('business rule: extensive impact on a mission-critical service is always P1', () => {
    const r = weighted.calculate({ impact: 4, urgency: 1, businessCriticality: 4, affectedUsers: 2, serviceUserBase: 1000 });
    expect(r.priority).toBe(Priority.P1);
    expect(r.rationale.join(' ')).toMatch(/Rule/);
  });

  test('affected-user level uses absolute and relative size', () => {
    expect(affectedUsersLevel(1, 1000)).toBe(1);
    expect(affectedUsersLevel(5, 1000)).toBe(2);
    expect(affectedUsersLevel(50, 1000)).toBe(3);
    expect(affectedUsersLevel(10, 15)).toBe(4); // 66% of a small user base
  });

  test('calculator switches strategy at runtime and rejects unknown keys', () => {
    const calc = new PriorityCalculator();
    expect(calc.active.key).toBe('WEIGHTED');
    calc.use('MATRIX');
    expect(calc.calculate({ impact: 2, urgency: 2, businessCriticality: 2, affectedUsers: 1, serviceUserBase: 0 }).strategy).toBe('MATRIX');
    expect(() => calc.use('NOPE')).toThrow(/Unknown priority strategy/);
  });
});
