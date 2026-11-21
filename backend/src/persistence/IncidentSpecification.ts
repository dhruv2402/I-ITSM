import { Priority } from '../domain/enums';
import { Incident } from '../domain/incident/Incident';
import { clock } from '../shared/clock';
import { IncidentSearchCriteria, Page } from './repositories';

const PRIORITY_RANK: Record<string, number> = { [Priority.P1]: 1, [Priority.P2]: 2, [Priority.P3]: 3, [Priority.P4]: 4 };

/**
 * Specification object: turns search criteria into an in-memory predicate,
 * plus sorting and paging. Shared by both repository implementations so the
 * filtering rules (e.g. time-dependent SLA status) live in exactly one place.
 */
export class IncidentSpecification {
  constructor(private readonly c: IncidentSearchCriteria) {}

  isSatisfiedBy(i: Incident, now: Date = clock.now()): boolean {
    const c = this.c;
    if (c.id && !i.id.toLowerCase().includes(c.id.toLowerCase())) return false;
    if (c.status?.length && !c.status.includes(i.status)) return false;
    if (c.priority?.length && (!i.priority || !c.priority.includes(i.priority))) return false;
    if (c.categoryCode && i.categoryCode !== c.categoryCode) return false;
    if (c.serviceId && i.serviceId !== c.serviceId) return false;
    if (c.technicianId && i.assignedTechnicianId !== c.technicianId) return false;
    if (c.reporterId && i.reporterId !== c.reporterId) return false;
    if (c.createdFrom && i.createdAt < c.createdFrom) return false;
    if (c.createdTo && i.createdAt > c.createdTo) return false;
    if (c.activeOnly && !i.isActive()) return false;
    if (c.escalated !== undefined && (i.escalationLevel > 0) !== c.escalated) return false;
    if (c.slaStatus && i.slaStatus(now) !== c.slaStatus) return false;
    if (c.visibleTo) {
      const { userId, includeAssigned } = c.visibleTo;
      if (!(i.reporterId === userId || (includeAssigned && i.assignedTechnicianId === userId))) return false;
    }
    if (c.text) {
      const hay = `${i.id} ${i.title} ${i.description}`.toLowerCase();
      if (!c.text.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false;
    }
    return true;
  }

  apply(all: Incident[]): Page<Incident> {
    const now = clock.now();
    const filtered = all.filter((i) => this.isSatisfiedBy(i, now));
    const dir = this.c.sortDir === 'asc' ? 1 : -1;
    const sortBy = this.c.sortBy ?? 'createdAt';
    filtered.sort((a, b) => {
      if (sortBy === 'priority') {
        const d = (PRIORITY_RANK[a.priority ?? ''] ?? 9) - (PRIORITY_RANK[b.priority ?? ''] ?? 9);
        // "desc" on priority means most urgent (P1) first
        return d !== 0 ? -d * dir : b.createdAt.getTime() - a.createdAt.getTime();
      }
      const key = sortBy === 'updatedAt' ? 'updatedAt' : 'createdAt';
      return (a[key].getTime() - b[key].getTime()) * dir;
    });
    const pageSize = Math.min(Math.max(this.c.pageSize ?? 20, 1), 200);
    const page = Math.max(this.c.page ?? 1, 1);
    return { items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize };
  }
}
