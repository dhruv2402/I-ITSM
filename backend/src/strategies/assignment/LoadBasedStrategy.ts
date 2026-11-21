import { AbstractAssignmentStrategy, AssignmentContext, RankedCandidate, TechnicianCandidate } from './AssignmentStrategy';

/** Balances work: the technician with the lowest utilisation wins; a matching skill breaks ties. */
export class LoadBasedStrategy extends AbstractAssignmentStrategy {
  readonly key = 'LOAD_BASED';
  readonly name = 'Load-based';
  readonly description = 'Assigns to the technician with the lowest workload relative to capacity.';

  protected order(ctx: AssignmentContext, eligible: TechnicianCandidate[]): RankedCandidate[] {
    const skill = (c: TechnicianCandidate) => (c.technician.hasSkill(ctx.categoryCode) ? 1 : 0);
    return [...eligible]
      .sort((a, b) => this.loadRatio(a) - this.loadRatio(b) || skill(b) - skill(a))
      .map((c) =>
        this.toRanked(c, (1 - this.loadRatio(c)) * 100, [
          `Utilisation ${Math.round(this.loadRatio(c) * 100)}% (${c.activeWorkload}/${c.technician.maxWorkload})`,
          skill(c) ? `Has skill ${ctx.categoryCode}` : 'No matching skill',
        ]),
      );
  }
}
