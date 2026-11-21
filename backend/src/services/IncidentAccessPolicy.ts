import { IncidentStatus, Permission } from '../domain/enums';
import { AuthorizationError } from '../domain/errors';
import { Incident } from '../domain/incident/Incident';
import { IncidentAction } from '../domain/incident/IncidentState';
import { User } from '../domain/user/User';

export type UserAction = IncidentAction | 'note' | 'feedback' | 'edit' | 'link';

/**
 * Role-based + ownership authorisation rules for incidents, kept in one class
 * so controllers and services never hard-code "who may do what".
 */
export class IncidentAccessPolicy {
  canView(u: User, i: Incident): boolean {
    return (
      u.hasPermission(Permission.INCIDENT_VIEW_ALL) ||
      i.isReporter(u.id) ||
      (u.hasPermission(Permission.INCIDENT_VIEW_ASSIGNED) && i.isAssignedTo(u.id))
    );
  }

  isAssignee(u: User, i: Incident): boolean {
    return u.hasPermission(Permission.INCIDENT_WORK) && i.isAssignedTo(u.id);
  }

  isSupervisor(u: User): boolean {
    return u.hasPermission(Permission.INCIDENT_ASSIGN);
  }

  assertCanView(u: User, i: Incident): void {
    if (!this.canView(u, i)) throw new AuthorizationError(`You are not allowed to view ${i.id}`);
  }

  assertAssignee(u: User, i: Incident): void {
    if (!this.isAssignee(u, i)) throw new AuthorizationError('Only the assigned technician can perform this action');
  }

  assertAssigneeOrSupervisor(u: User, i: Incident): void {
    if (!this.isAssignee(u, i) && !this.isSupervisor(u)) {
      throw new AuthorizationError('Only the assigned technician, a team lead or an administrator can perform this action');
    }
  }

  assertCanAssign(u: User): void {
    if (!this.isSupervisor(u)) throw new AuthorizationError('Only team leads and administrators can assign incidents');
  }

  assertReporter(u: User, i: Incident): void {
    if (!i.isReporter(u.id)) throw new AuthorizationError('Only the person who reported the incident can do this');
  }

  assertCanClose(u: User, i: Incident): void {
    const ok = i.isReporter(u.id) || (u.hasPermission(Permission.INCIDENT_CLOSE) && (i.isAssignedTo(u.id) || this.isSupervisor(u)));
    if (!ok) throw new AuthorizationError('You are not allowed to close this incident');
  }

  assertCanEdit(u: User, i: Incident): void {
    if (u.hasPermission(Permission.INCIDENT_UPDATE_ANY)) return;
    const early = [IncidentStatus.NEW, IncidentStatus.CLASSIFIED, IncidentStatus.ASSIGNED].includes(i.status);
    if (i.isReporter(u.id) && early) return;
    throw new AuthorizationError('Only the reporter (before work starts) or an administrator can edit incident details');
  }

  /** Actions the UI should offer this user right now: legal in the current state AND permitted for the role. */
  permittedActions(u: User, i: Incident): UserAction[] {
    const allowed = (fn: () => void) => {
      try {
        fn();
        return true;
      } catch {
        return false;
      }
    };
    const out: UserAction[] = [];
    for (const a of i.availableActions()) {
      const ok =
        a === 'classify' ? allowed(() => this.assertAssigneeOrSupervisor(u, i))
        : a === 'assign' ? this.isSupervisor(u)
        : a === 'acknowledge' || a === 'start' || a === 'requestInfo' ? this.isAssignee(u, i)
        : a === 'resolve' ? allowed(() => this.assertAssigneeOrSupervisor(u, i))
        : a === 'provideInfo' || a === 'verify' ? i.isReporter(u.id)
        : a === 'reopen' ? i.isReporter(u.id) || this.isSupervisor(u)
        : a === 'close' ? allowed(() => this.assertCanClose(u, i))
        : false;
      if (ok) out.push(a);
    }
    if (i.status !== IncidentStatus.CLOSED && this.canView(u, i)) out.push('note');
    if (i.isReporter(u.id) && !i.feedback && [IncidentStatus.RESOLVED, IncidentStatus.VERIFIED, IncidentStatus.CLOSED].includes(i.status)) {
      out.push('feedback');
    }
    if (allowed(() => this.assertCanEdit(u, i)) && ![IncidentStatus.RESOLVED, IncidentStatus.VERIFIED, IncidentStatus.CLOSED].includes(i.status)) {
      out.push('edit');
    }
    if (this.isSupervisor(u) || this.isAssignee(u, i)) out.push('link');
    return out;
  }
}
