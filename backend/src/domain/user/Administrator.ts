import { Permission, Role } from '../enums';
import { User, UserProps } from './User';

const ADMIN_PERMISSIONS: ReadonlySet<Permission> = new Set([
  Permission.INCIDENT_CREATE,
  Permission.INCIDENT_VIEW_OWN,
  Permission.INCIDENT_VIEW_ALL,
  Permission.INCIDENT_ASSIGN,
  Permission.INCIDENT_CLOSE,
  Permission.INCIDENT_UPDATE_ANY,
  Permission.USER_MANAGE,
  Permission.CONFIG_MANAGE,
  Permission.REPORT_VIEW,
  Permission.AUDIT_VIEW,
]);

const MANAGER_PERMISSIONS: ReadonlySet<Permission> = new Set([...ADMIN_PERMISSIONS, Permission.REPORT_EXPORT]);

/** System administrator: manages users, services, SLA policies and configuration. */
export class Administrator extends User {
  constructor(props: UserProps) {
    super({ ...props, role: props.role === Role.MANAGER ? Role.MANAGER : Role.ADMIN });
  }

  protected permissionSet(): ReadonlySet<Permission> {
    return ADMIN_PERMISSIONS;
  }

  get title(): string {
    return 'System Administrator';
  }

  isSupportStaff(): boolean {
    return true;
  }
}

/** IT manager: an administrator with reporting/export rights; last escalation level. */
export class Manager extends Administrator {
  constructor(props: UserProps) {
    super({ ...props, role: Role.MANAGER });
  }

  protected permissionSet(): ReadonlySet<Permission> {
    return MANAGER_PERMISSIONS;
  }

  get title(): string {
    return 'IT Manager';
  }
}
