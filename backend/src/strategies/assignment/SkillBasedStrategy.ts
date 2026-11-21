import { AbstractAssignmentStrategy, AssignmentContext, RankedCandidate, TechnicianCandidate } from './AssignmentStrategy';

/** Only technicians with the incident's category as a skill; least busy (then most experienced) first. */
export class SkillBasedStrategy extends AbstractAssignmentStrategy {
  readonly key = 'SKILL_BASED';
  readonly name = 'Skill-based';
  readonly description = 'Picks a technician whose skills match the incident category, preferring the least loaded.';

  protected filterEligible(ctx: AssignmentContext, candidates: TechnicianCandidate[]): TechnicianCandidate[] {
    return super.filterEligible(ctx, candidates).filter((c) => c.technician.hasSkill(ctx.categoryCode));
  }

  protected order(ctx: AssignmentContext, eligible: TechnicianCandidate[]): RankedCandidate[] {
    return [...eligible]
      .sort((a, b) => a.activeWorkload - b.activeWorkload || b.technician.experienceYears - a.technician.experienceYears)
      .map((c) =>
        this.toRanked(c, 100 - this.loadRatio(c) * 50, [
          `Has skill ${ctx.categoryCode}`,
          `Workload ${c.activeWorkload}/${c.technician.maxWorkload}`,
        ]),
      );
  }
}
