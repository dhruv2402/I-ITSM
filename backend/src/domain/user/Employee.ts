import { Permission, Role } from '../enums';
import { User, UserProps } from './User';

const EMPLOYEE_PERMISSIONS: ReadonlySet<Permission> = new Set([
  Permission.INCIDENT_CREATE,
  Permission.INCIDENT_VIEW_OWN,
]);

/** An employee / customer who reports incidents and tracks them. */
export class Employee extends User {
  constructor(props: UserProps) {
    super({ ...props, role: Role.EMPLOYEE });
  }

  protected permissionSet(): ReadonlySet<Permission> {
    return EMPLOYEE_PERMISSIONS;
  }

  get title(): string {
    return 'Employee';
  }
}
