import { Priority } from '../../domain/enums';
import { Technician } from '../../domain/user/Technician';

/** A technician together with the live facts needed to judge them for one incident. */
export interface TechnicianCandidate {
  technician: Technician;
  activeWorkload: number;
  resolvedForService: number;
  resolvedInCategory: number;
}

export interface AssignmentContext {
  incidentId: string;
  categoryCode: string | null;
  serviceId: string;
  priority: Priority | null;
}

export interface RankedCandidate {
  technicianId: string;
  technicianName: string;
  score: number;
  activeWorkload: number;
  maxWorkload: number;
  reasons: string[];
}

/** Strategy contract for technician assignment. */
export interface AssignmentStrategy {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  rank(ctx: AssignmentContext, candidates: TechnicianCandidate[]): RankedCandidate[];
  select(ctx: AssignmentContext, candidates: TechnicianCandidate[]): RankedCandidate | null;
}

/**
 * Template Method: every strategy follows the same skeleton
 *   eligible = filterEligible(candidates)  -> order(eligible)  -> pick first
 * and only overrides the steps that differ.
 */
export abstract class AbstractAssignmentStrategy implements AssignmentStrategy {
  abstract readonly key: string;
  abstract readonly name: string;
  abstract readonly description: string;

  select(ctx: AssignmentContext, candidates: TechnicianCandidate[]): RankedCandidate | null {
    return this.rank(ctx, candidates)[0] ?? null;
  }

  rank(ctx: AssignmentContext, candidates: TechnicianCandidate[]): RankedCandidate[] {
    return this.order(ctx, this.filterEligible(ctx, candidates));
  }

  /** Default eligibility: active, marked available and below their workload limit. */
  protected filterEligible(_ctx: AssignmentContext, candidates: TechnicianCandidate[]): TechnicianCandidate[] {
    return candidates.filter((c) => c.technician.isAvailable && c.technician.canTakeMore(c.activeWorkload));
  }

  protected abstract order(ctx: AssignmentContext, eligible: TechnicianCandidate[]): RankedCandidate[];

  protected toRanked(c: TechnicianCandidate, score: number, reasons: string[]): RankedCandidate {
    return {
      technicianId: c.technician.id,
      technicianName: c.technician.name,
      score: Math.round(score * 10) / 10,
      activeWorkload: c.activeWorkload,
      maxWorkload: c.technician.maxWorkload,
      reasons,
    };
  }

  protected loadRatio(c: TechnicianCandidate): number {
    return c.activeWorkload / c.technician.maxWorkload;
  }
}
