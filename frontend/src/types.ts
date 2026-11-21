export type Role = 'EMPLOYEE' | 'TECHNICIAN' | 'TEAM_LEAD' | 'ADMIN' | 'MANAGER';
export type Priority = 'P1' | 'P2' | 'P3' | 'P4';
export type Status = 'NEW' | 'CLASSIFIED' | 'ASSIGNED' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'PENDING_INFO' | 'RESOLVED' | 'VERIFIED' | 'CLOSED';
export type SlaStatus = 'ON_TRACK' | 'AT_RISK' | 'BREACHED' | 'MET' | 'PAUSED' | 'NONE';

export const STATUSES: Status[] = ['NEW', 'CLASSIFIED', 'ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'PENDING_INFO', 'RESOLVED', 'VERIFIED', 'CLOSED'];
export const PRIORITIES: Priority[] = ['P1', 'P2', 'P3', 'P4'];
export const PRIORITY_LABEL: Record<Priority, string> = { P1: 'Critical', P2: 'High', P3: 'Medium', P4: 'Low' };
export const LEVELS = [
  { v: 1, label: 'Low' },
  { v: 2, label: 'Medium' },
  { v: 3, label: 'High' },
  { v: 4, label: 'Critical' },
];

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  phone?: string;
  department?: string;
  active: boolean;
  permissions: string[];
  skills?: string[];
  maxWorkload?: number;
  experienceYears?: number;
  available?: boolean;
  activeWorkload?: number;
}

export interface Note {
  id: string;
  type: 'INVESTIGATION' | 'COMMENT' | 'INFO_REQUEST' | 'INFO_RESPONSE' | 'SYSTEM';
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
}

export interface Sla {
  policyName: string;
  responseMinutes: number;
  resolutionMinutes: number;
  responseDueAt: string;
  resolutionDueAt: string;
  respondedAt: string | null;
  resolvedAt: string | null;
  pausedAt: string | null;
  responseBreached: boolean;
  resolutionBreached: boolean;
}

export interface Incident {
  id: string;
  title: string;
  description: string;
  reporterId: string;
  reporterName: string;
  categoryCode: string | null;
  categoryConfidence: number | null;
  serviceId: string;
  impact: number;
  urgency: number;
  businessCriticality: number;
  affectedUsers: number;
  priority: Priority | null;
  priorityScore: number | null;
  priorityStrategy: string | null;
  priorityRationale: string[];
  status: Status;
  stateDescription: string;
  assignedTechnicianId: string | null;
  assignedTechnicianName: string | null;
  sla: Sla | null;
  slaStatus: SlaStatus;
  slaElapsedPct: number | null;
  notes: Note[];
  resolution: { summary: string; rootCause: string; resolvedByName: string; resolvedAt: string } | null;
  closure: { closedByName: string; closedAt: string; closureCode: string } | null;
  feedback: { rating: number; comment: string; submittedAt: string } | null;
  escalationLevel: number;
  relatedIncidentIds: string[];
  duplicateOfId: string | null;
  reopenCount: number;
  createdAt: string;
  updatedAt: string;
  responseTimeMinutes: number | null;
  resolutionTimeMinutes: number | null;
  permittedActions: string[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ItService {
  id: string;
  name: string;
  description: string;
  businessCriticality: number;
  ownerTeam: string;
  userBase: number;
  dependsOn: string[];
  active: boolean;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  active: boolean;
}

export interface SlaPolicy {
  id: string;
  name: string;
  priority: Priority;
  serviceId: string | null;
  responseMinutes: number;
  resolutionMinutes: number;
  warningThresholdPct: number;
  active: boolean;
}

export interface AuditRecord {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  incidentId: string | null;
  previousState: string | null;
  newState: string | null;
  description: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  incidentId: string | null;
  read: boolean;
  createdAt: string;
  channel: string;
  status: string;
  userId: string;
  eventType: string;
}

export interface DuplicateCandidate {
  incidentId: string;
  title: string;
  status: string;
  score: number;
  textSimilarity: number;
  sameService: boolean;
  sharedTerms: string[];
}

export interface ResolutionSuggestion {
  incidentId: string;
  title: string;
  resolution: string;
  rootCause: string;
  similarity: number;
  rating: number | null;
}

export interface Correlation {
  key: string;
  type: 'SAME_SERVICE' | 'SHARED_DEPENDENCY';
  serviceId: string;
  serviceName: string;
  incidentIds: string[];
  affectedServices: string[];
  probableRootCause: string;
  confidence: number;
}

export interface RankedCandidate {
  technicianId: string;
  technicianName: string;
  score: number;
  activeWorkload: number;
  maxWorkload: number;
  reasons: string[];
}

export interface StrategyInfo {
  key: string;
  name: string;
  description: string;
  active: boolean;
}
