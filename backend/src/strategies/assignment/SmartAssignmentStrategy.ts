import { Priority } from '../../domain/enums';
import { AbstractAssignmentStrategy, AssignmentContext, RankedCandidate, TechnicianCandidate } from './AssignmentStrategy';

/**
 * Intelligent feature "Smart Technician Recommendation": multi-factor weighted score
 *   skill match            40
 *   spare capacity         25
 *   experience (years)     15   (capped at 10 years)
 *   history with service   15   (capped at 5 resolved incidents on the same service)
 *   seniority for P1/P2     5
 * Every score comes with human readable reasons, so the recommendation is explainable.
 */
export class SmartAssignmentStrategy extends AbstractAssignmentStrategy {
  readonly key = 'SMART';
  readonly name = 'Smart (multi-factor)';
  readonly description = 'Scores skills, workload, experience, history with the affected service and priority fit.';

  protected order(ctx: AssignmentContext, eligible: TechnicianCandidate[]): RankedCandidate[] {
    return eligible
      .map((c) => {
        const reasons: string[] = [];
        const skill = c.technician.hasSkill(ctx.categoryCode) ? 40 : 0;
        reasons.push(skill ? `Skill match: ${ctx.categoryCode} (+40)` : 'No skill match (+0)');
        const capacity = 25 * (1 - this.loadRatio(c));
        reasons.push(`Workload ${c.activeWorkload}/${c.technician.maxWorkload} (+${capacity.toFixed(1)})`);
        const exp = 15 * Math.min(c.technician.experienceYears / 10, 1);
        reasons.push(`${c.technician.experienceYears} yrs experience (+${exp.toFixed(1)})`);
        const history = 15 * Math.min(c.resolvedForService / 5, 1);
        reasons.push(`${c.resolvedForService} past incidents on this service (+${history.toFixed(1)})`);
        const urgent = ctx.priority === Priority.P1 || ctx.priority === Priority.P2;
        const seniority = urgent && c.technician.experienceYears >= 5 ? 5 : 0;
        if (seniority) reasons.push('Senior engineer for a high-priority incident (+5)');
        return this.toRanked(c, skill + capacity + exp + history + seniority, reasons);
      })
      .sort((a, b) => b.score - a.score);
  }
}
