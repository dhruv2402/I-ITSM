import { Permission, Role } from '../enums';
import { ValidationError } from '../errors';
import { TechnicianExtras, User, UserProps, UserSnapshot } from './User';

const TECHNICIAN_PERMISSIONS: ReadonlySet<Permission> = new Set([
  Permission.INCIDENT_CREATE,
  Permission.INCIDENT_VIEW_OWN,
  Permission.INCIDENT_VIEW_ASSIGNED,
  Permission.INCIDENT_WORK,
  Permission.INCIDENT_CLOSE,
]);

const TEAM_LEAD_PERMISSIONS: ReadonlySet<Permission> = new Set([
  ...TECHNICIAN_PERMISSIONS,
  Permission.INCIDENT_VIEW_ALL,
  Permission.INCIDENT_ASSIGN,
  Permission.REPORT_VIEW,
]);

/** Support engineer who investigates and resolves incidents. */
export class Technician extends User {
  private extras: TechnicianExtras;

  constructor(props: UserProps, extras: Partial<TechnicianExtras> = {}) {
    super({ ...props, role: props.role === Role.TEAM_LEAD ? Role.TEAM_LEAD : Role.TECHNICIAN });
    this.extras = {
      skills: (extras.skills ?? []).map((s) => s.toUpperCase()),
      maxWorkload: extras.maxWorkload ?? 5,
      experienceYears: extras.experienceYears ?? 0,
      available: extras.available ?? true,
    };
    Technician.validateExtras(this.extras);
  }

  private static validateExtras(e: TechnicianExtras): void {
    if (!Number.isInteger(e.maxWorkload) || e.maxWorkload < 1 || e.maxWorkload > 50) {
      throw new ValidationError('Maximum workload must be an integer between 1 and 50');
    }
    if (e.experienceYears < 0 || e.experienceYears > 60) {
      throw new ValidationError('Experience must be between 0 and 60 years');
    }
  }

  protected permissionSet(): ReadonlySet<Permission> {
    return TECHNICIAN_PERMISSIONS;
  }

  get title(): string {
    return 'Support Engineer';
  }

  isSupportStaff(): boolean {
    return true;
  }

  get skills(): string[] {
    return [...this.extras.skills];
  }
  get maxWorkload(): number {
    return this.extras.maxWorkload;
  }
  get experienceYears(): number {
    return this.extras.experienceYears;
  }
  get isAvailable(): boolean {
    return this.isActive && this.extras.available;
  }

  hasSkill(categoryCode: string | null): boolean {
    return !!categoryCode && this.extras.skills.includes(categoryCode.toUpperCase());
  }

  canTakeMore(currentWorkload: number): boolean {
    return currentWorkload < this.extras.maxWorkload;
  }

  setAvailability(available: boolean): void {
    this.extras.available = available;
  }

  updateTechnicalProfile(changes: Partial<Omit<TechnicianExtras, 'available'>>): void {
    const next: TechnicianExtras = {
      skills: (changes.skills ?? this.extras.skills).map((s) => s.toUpperCase()),
      maxWorkload: changes.maxWorkload ?? this.extras.maxWorkload,
      experienceYears: changes.experienceYears ?? this.extras.experienceYears,
      available: this.extras.available,
    };
    Technician.validateExtras(next);
    this.extras = next;
  }

  toSnapshot(): UserSnapshot {
    return { ...super.toSnapshot(), ...this.extras, skills: [...this.extras.skills] };
  }
}

/**
 * A team lead IS-A technician (still works incidents) with extra rights to
 * assign work and see the whole queue. First level of the escalation chain.
 */
export class TeamLead extends Technician {
  constructor(props: UserProps, extras: Partial<TechnicianExtras> = {}) {
    super({ ...props, role: Role.TEAM_LEAD }, extras);
  }

  protected permissionSet(): ReadonlySet<Permission> {
    return TEAM_LEAD_PERMISSIONS;
  }

  get title(): string {
    return 'Team Lead';
  }
}
