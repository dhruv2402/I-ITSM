export enum Role {
  EMPLOYEE = 'EMPLOYEE',
  TECHNICIAN = 'TECHNICIAN',
  TEAM_LEAD = 'TEAM_LEAD',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
}

export enum IncidentStatus {
  NEW = 'NEW',
  CLASSIFIED = 'CLASSIFIED',
  ASSIGNED = 'ASSIGNED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  IN_PROGRESS = 'IN_PROGRESS',
  PENDING_INFO = 'PENDING_INFO',
  RESOLVED = 'RESOLVED',
  VERIFIED = 'VERIFIED',
  CLOSED = 'CLOSED',
}

export enum Priority {
  P1 = 'P1',
  P2 = 'P2',
  P3 = 'P3',
  P4 = 'P4',
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  [Priority.P1]: 'Critical',
  [Priority.P2]: 'High',
  [Priority.P3]: 'Medium',
  [Priority.P4]: 'Low',
};

/** Ordinal scale used for impact, urgency and business criticality (1 = low, 4 = critical). */
export type Level = 1 | 2 | 3 | 4;

export const isLevel = (n: unknown): n is Level => n === 1 || n === 2 || n === 3 || n === 4;

export enum SlaStatus {
  ON_TRACK = 'ON_TRACK',
  AT_RISK = 'AT_RISK',
  BREACHED = 'BREACHED',
  MET = 'MET',
  PAUSED = 'PAUSED',
  NONE = 'NONE',
}

export enum NoteType {
  INVESTIGATION = 'INVESTIGATION',
  COMMENT = 'COMMENT',
  INFO_REQUEST = 'INFO_REQUEST',
  INFO_RESPONSE = 'INFO_RESPONSE',
  SYSTEM = 'SYSTEM',
}

export enum ChannelType {
  IN_APP = 'IN_APP',
  EMAIL = 'EMAIL',
  SMS = 'SMS',
}

export enum Permission {
  INCIDENT_CREATE = 'INCIDENT_CREATE',
  INCIDENT_VIEW_OWN = 'INCIDENT_VIEW_OWN',
  INCIDENT_VIEW_ASSIGNED = 'INCIDENT_VIEW_ASSIGNED',
  INCIDENT_VIEW_ALL = 'INCIDENT_VIEW_ALL',
  INCIDENT_WORK = 'INCIDENT_WORK',
  INCIDENT_ASSIGN = 'INCIDENT_ASSIGN',
  INCIDENT_CLOSE = 'INCIDENT_CLOSE',
  INCIDENT_UPDATE_ANY = 'INCIDENT_UPDATE_ANY',
  USER_MANAGE = 'USER_MANAGE',
  CONFIG_MANAGE = 'CONFIG_MANAGE',
  REPORT_VIEW = 'REPORT_VIEW',
  REPORT_EXPORT = 'REPORT_EXPORT',
  AUDIT_VIEW = 'AUDIT_VIEW',
}
