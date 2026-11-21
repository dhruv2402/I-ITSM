import { IncidentStatus } from '../enums';

/** One immutable line of the audit trail. */
export interface AuditRecord {
  id: string;
  timestamp: Date;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  incidentId: string | null;
  previousState: IncidentStatus | null;
  newState: IncidentStatus | null;
  description: string;
}

export interface AuditSearchCriteria {
  incidentId?: string;
  userId?: string;
  action?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}
