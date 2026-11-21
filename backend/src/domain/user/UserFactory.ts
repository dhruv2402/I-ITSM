import { Role } from '../enums';
import { ValidationError } from '../errors';
import { Administrator, Manager } from './Administrator';
import { Employee } from './Employee';
import { TeamLead, Technician } from './Technician';
import { User, UserSnapshot } from './User';

/**
 * Factory Method: the only place that knows which concrete class represents
 * each role. Used for registration, admin user creation and for rebuilding
 * users from persistence.
 */
export class UserFactory {
  static create(snapshot: UserSnapshot): User {
    const base = {
      id: snapshot.id,
      name: snapshot.name,
      email: snapshot.email.toLowerCase(),
      passwordHash: snapshot.passwordHash,
      role: snapshot.role,
      phone: snapshot.phone,
      department: snapshot.department,
      active: snapshot.active ?? true,
      createdAt: snapshot.createdAt ? new Date(snapshot.createdAt) : new Date(),
    };
    const extras = {
      skills: snapshot.skills,
      maxWorkload: snapshot.maxWorkload,
      experienceYears: snapshot.experienceYears,
      available: snapshot.available,
    };
    switch (snapshot.role) {
      case Role.EMPLOYEE:
        return new Employee(base);
      case Role.TECHNICIAN:
        return new Technician(base, extras);
      case Role.TEAM_LEAD:
        return new TeamLead(base, extras);
      case Role.ADMIN:
        return new Administrator(base);
      case Role.MANAGER:
        return new Manager(base);
      default:
        throw new ValidationError(`Unknown role: ${String(snapshot.role)}`);
    }
  }

  /** Prefix used when generating readable ids (E1001, T1002, A1001 ...). */
  static idPrefix(role: Role): string {
    switch (role) {
      case Role.EMPLOYEE:
        return 'E';
      case Role.TECHNICIAN:
      case Role.TEAM_LEAD:
        return 'T';
      default:
        return 'A';
    }
  }
}

export const isTechnician = (u: User | null | undefined): u is Technician => u instanceof Technician;
