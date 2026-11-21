import { AbstractAssignmentStrategy, AssignmentContext, RankedCandidate, TechnicianCandidate } from './AssignmentStrategy';

/**
 * Rotates through eligible technicians in a fixed order (by id). Prefers the
 * skilled subset when one exists. Keeps its own cursor, so this strategy is stateful.
 */
export class RoundRobinStrategy extends AbstractAssignmentStrategy {
  readonly key = 'ROUND_ROBIN';
  readonly name = 'Round-robin';
  readonly description = 'Distributes incidents in turn among available technicians (skilled ones first).';
  private lastAssignedId: string | null = null;

  protected order(ctx: AssignmentContext, eligible: TechnicianCandidate[]): RankedCandidate[] {
    const skilled = eligible.filter((c) => c.technician.hasSkill(ctx.categoryCode));
    const pool = (skilled.length > 0 ? skilled : eligible).sort((a, b) => a.technician.id.localeCompare(b.technician.id));
    if (pool.length === 0) return [];
    const lastIdx = this.lastAssignedId ? pool.findIndex((c) => c.technician.id > this.lastAssignedId!) : 0;
    const start = lastIdx < 0 ? 0 : lastIdx;
    const rotated = [...pool.slice(start), ...pool.slice(0, start)];
    return rotated.map((c, i) => this.toRanked(c, pool.length - i, [`Next in rotation (position ${i + 1} of ${pool.length})`]));
  }

  select(ctx: AssignmentContext, candidates: TechnicianCandidate[]): RankedCandidate | null {
    const chosen = super.select(ctx, candidates);
    if (chosen) this.lastAssignedId = chosen.technicianId;
    return chosen;
  }
}
