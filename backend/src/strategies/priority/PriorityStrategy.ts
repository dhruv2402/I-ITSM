import { Level, Priority } from '../../domain/enums';
import { PriorityAssessment } from '../../domain/incident/Incident';

export interface PriorityInput {
  impact: Level;
  urgency: Level;
  businessCriticality: Level;
  affectedUsers: number;
  /** Total users of the affected service, used to judge how widespread the outage is. */
  serviceUserBase: number;
}

/** Strategy contract for priority determination algorithms. */
export interface PriorityStrategy {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  calculate(input: PriorityInput): PriorityAssessment;
}

export const LEVEL_NAME: Record<Level, string> = { 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Critical' };

/** Maps the number of affected users (absolute and relative to the user base) onto the 1-4 scale. */
export function affectedUsersLevel(affected: number, userBase: number): Level {
  const ratio = userBase > 0 ? affected / userBase : 0;
  if (affected >= 500 || ratio >= 0.5) return 4;
  if (affected >= 50 || ratio >= 0.2) return 3;
  if (affected >= 5) return 2;
  return 1;
}
