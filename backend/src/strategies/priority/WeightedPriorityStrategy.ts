import { Priority } from '../../domain/enums';
import { PriorityAssessment } from '../../domain/incident/Incident';
import { affectedUsersLevel, LEVEL_NAME, PriorityInput, PriorityStrategy } from './PriorityStrategy';

const WEIGHTS = { impact: 0.35, urgency: 0.3, criticality: 0.2, users: 0.15 };
const ORDER = [Priority.P1, Priority.P2, Priority.P3, Priority.P4];
const atLeast = (p: Priority, floor: Priority): Priority => (ORDER.indexOf(p) > ORDER.indexOf(floor) ? floor : p);

/**
 * Default algorithm: weighted scoring + business rules.
 *
 *  1. Each factor is on a 1..4 scale. Affected users are converted using both the
 *     absolute number and the share of the service's user base.
 *  2. Weighted sum (impact 35%, urgency 30%, criticality 20%, users 15%) is
 *     normalised to 0..100.  P1 >= 75, P2 >= 50, P3 >= 25, else P4.
 *  3. Rule overrides guarantee sensible floors:
 *     - extensive impact on a mission-critical service is always P1
 *     - 500+ affected users is at least P2
 *     - critical urgency on a critical service is at least P2
 */
export class WeightedPriorityStrategy implements PriorityStrategy {
  readonly key = 'WEIGHTED';
  readonly name = 'Weighted scoring with business rules';
  readonly description =
    'Weighted sum of impact, urgency, business criticality and number of affected users (0-100) plus rule-based overrides.';

  calculate(input: PriorityInput): PriorityAssessment {
    const users = affectedUsersLevel(input.affectedUsers, input.serviceUserBase);
    const weighted =
      WEIGHTS.impact * input.impact +
      WEIGHTS.urgency * input.urgency +
      WEIGHTS.criticality * input.businessCriticality +
      WEIGHTS.users * users;
    const score = Math.round(((weighted - 1) / 3) * 100);
    let priority = score >= 75 ? Priority.P1 : score >= 50 ? Priority.P2 : score >= 25 ? Priority.P3 : Priority.P4;

    const rationale = [
      `Impact ${LEVEL_NAME[input.impact]}, urgency ${LEVEL_NAME[input.urgency]}, service criticality ${LEVEL_NAME[input.businessCriticality]}, affected users ${input.affectedUsers} (level ${users})`,
      `Weighted score = ${score}/100 (P1 >= 75, P2 >= 50, P3 >= 25)`,
    ];

    if (input.impact === 4 && input.businessCriticality === 4 && priority !== Priority.P1) {
      priority = Priority.P1;
      rationale.push('Rule: extensive impact on a mission-critical service => P1');
    }
    if (input.affectedUsers >= 500 && atLeast(priority, Priority.P2) !== priority) {
      priority = Priority.P2;
      rationale.push('Rule: 500+ affected users => at least P2');
    }
    if (input.urgency === 4 && input.businessCriticality >= 3 && atLeast(priority, Priority.P2) !== priority) {
      priority = Priority.P2;
      rationale.push('Rule: critical urgency on a high-criticality service => at least P2');
    }
    return { priority, score, strategy: this.key, rationale };
  }
}
