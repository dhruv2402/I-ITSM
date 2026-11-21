import { Priority } from '../../domain/enums';
import { PriorityAssessment } from '../../domain/incident/Incident';
import { LEVEL_NAME, PriorityInput, PriorityStrategy } from './PriorityStrategy';

/**
 * Classic ITIL-style multiplicative matrix from the project brief:
 *   score = Impact x Urgency x Business Criticality   (range 1..64)
 *   P1 >= 36, P2 >= 18, P3 >= 8, otherwise P4
 */
export class MatrixPriorityStrategy implements PriorityStrategy {
  readonly key = 'MATRIX';
  readonly name = 'Impact x Urgency x Criticality matrix';
  readonly description = 'Multiplies impact, urgency and business criticality (1-64) and maps the score to P1-P4.';

  calculate(input: PriorityInput): PriorityAssessment {
    const score = input.impact * input.urgency * input.businessCriticality;
    const priority = score >= 36 ? Priority.P1 : score >= 18 ? Priority.P2 : score >= 8 ? Priority.P3 : Priority.P4;
    return {
      priority,
      score,
      strategy: this.key,
      rationale: [
        `Impact ${LEVEL_NAME[input.impact]} (${input.impact}) x Urgency ${LEVEL_NAME[input.urgency]} (${input.urgency}) x Criticality ${LEVEL_NAME[input.businessCriticality]} (${input.businessCriticality}) = ${score}`,
        'Thresholds: P1 >= 36, P2 >= 18, P3 >= 8, else P4',
      ],
    };
  }
}
