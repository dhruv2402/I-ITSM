import { Permission, Role } from '../enums';
import { ValidationError } from '../errors';

export interface UserProps {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  phone?: string;
  department?: string;
  active: boolean;
  createdAt: Date;
}

/** Extra state that only technicians (and team leads) carry. */
export interface TechnicianExtras {
  skills: string[];
  maxWorkload: number;
  experienceYears: number;
  available: boolean;
}

/** Flat persistence representation of any user. */
export type UserSnapshot = UserProps & Partial<TechnicianExtras>;

/** Safe representation sent to clients: the password hash is never exposed. */
export type PublicUser = Omit<UserSnapshot, 'passwordHash'> & { title: string; permissions: Permission[] };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Abstract base of the user hierarchy (Employee, Technician, TeamLead,
 * Administrator, Manager). State is private to the hierarchy and only changes
 * through intention-revealing methods (encapsulation).
 */
export abstract class User {
  protected constructor(protected props: UserProps) {
    User.validate(props);
  }

  private static validate(p: UserProps): void {
    if (!p.id) throw new ValidationError('User id is required');
    if (!p.name || p.name.trim().length < 2) throw new ValidationError('Name must have at least 2 characters');
    if (!EMAIL_RE.test(p.email)) throw new ValidationError(`Invalid e-mail address: ${p.email}`);
    if (!p.passwordHash) throw new ValidationError('Password hash is required');
  }

  get id(): string {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }
  get email(): string {
    return this.props.email;
  }
  get role(): Role {
    return this.props.role;
  }
  get phone(): string | undefined {
    return this.props.phone;
  }
  get department(): string | undefined {
    return this.props.department;
  }
  get isActive(): boolean {
    return this.props.active;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get passwordHash(): string {
    return this.props.passwordHash;
  }

  /** Each concrete role defines what it is allowed to do (polymorphism). */
  protected abstract permissionSet(): ReadonlySet<Permission>;

  /** Human readable job title shown in the UI. */
  abstract get title(): string;

  /** Whether the user belongs to the IT support organisation. */
  isSupportStaff(): boolean {
    return false;
  }

  hasPermission(p: Permission): boolean {
    return this.props.active && this.permissionSet().has(p);
  }

  permissions(): Permission[] {
    return [...this.permissionSet()];
  }

  updateProfile(changes: { name?: string; phone?: string; department?: string }): void {
    if (changes.name !== undefined) {
      if (changes.name.trim().length < 2) throw new ValidationError('Name must have at least 2 characters');
      this.props.name = changes.name.trim();
    }
    if (changes.phone !== undefined) this.props.phone = changes.phone;
    if (changes.department !== undefined) this.props.department = changes.department;
  }

  changePasswordHash(hash: string): void {
    if (!hash) throw new ValidationError('Password hash is required');
    this.props.passwordHash = hash;
  }

  deactivate(): void {
    this.props.active = false;
  }

  activate(): void {
    this.props.active = true;
  }

  toSnapshot(): UserSnapshot {
    return { ...this.props };
  }

  toPublic(): PublicUser {
    const { passwordHash: _hidden, ...rest } = this.toSnapshot();
    return { ...rest, title: this.title, permissions: this.permissions() };
  }

  toActor(): { id: string; name: string; role: Role } {
    return { id: this.id, name: this.name, role: this.role };
  }
}
