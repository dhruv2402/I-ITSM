import { IncidentStatus, Permission, Priority, Role, SlaStatus } from '../domain/enums';
import { AuthorizationError } from '../domain/errors';
import { Incident } from '../domain/incident/Incident';
import { User } from '../domain/user/User';
import { isTechnician } from '../domain/user/UserFactory';
import { CorrelationEngine } from '../intelligence/CorrelationEngine';
import { SlaRiskPredictor } from '../intelligence/SlaRiskPredictor';
import { IncidentSearchCriteria, Repositories } from '../persistence/repositories';
import { clock } from '../shared/clock';

const DONE = [IncidentStatus.RESOLVED, IncidentStatus.VERIFIED, IncidentStatus.CLOSED];
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

/** Dashboards, analytics and exports for managers/administrators. */
export class ReportService {
  constructor(
    private readonly repos: Repositories,
    private readonly risk: SlaRiskPredictor,
    private readonly correlation: CorrelationEngine,
  ) {}

  private requireReports(u: User): void {
    if (!u.hasPermission(Permission.REPORT_VIEW)) throw new AuthorizationError('Reports are available to team leads, administrators and managers');
  }

  private all(): Promise<Incident[]> {
    return this.repos.incidents.findAll();
  }

  async avgResolutionByCategory(): Promise<Map<string, number>> {
    const groups = new Map<string, number[]>();
    (await this.repos.incidents.findSolved(2000)).forEach((i) => {
      const t = i.slaTracker?.resolutionTimeMinutes();
      if (i.categoryCode && t != null) groups.set(i.categoryCode, [...(groups.get(i.categoryCode) ?? []), t]);
    });
    return new Map([...groups].map(([k, v]) => [k, avg(v) ?? 0]));
  }

  async overview(u: User) {
    this.requireReports(u);
    const all = await this.all();
    const now = clock.now();
    const active = all.filter((i) => i.isActive());
    const finished = all.filter((i) => i.slaTracker && DONE.includes(i.status));
    const breached = all.filter((i) => i.slaStatus(now) === SlaStatus.BREACHED);
    const met = finished.filter((i) => !i.slaTracker!.hasBreach);
    const ratings = all.map((i) => i.feedback?.rating).filter((r): r is number => r != null);
    return {
      totalIncidents: all.length,
      openIncidents: active.length,
      criticalIncidents: active.filter((i) => i.priority === Priority.P1).length,
      resolvedIncidents: all.filter((i) => DONE.includes(i.status)).length,
      closedIncidents: all.filter((i) => i.status === IncidentStatus.CLOSED).length,
      slaViolations: breached.length,
      atRisk: active.filter((i) => i.slaStatus(now) === SlaStatus.AT_RISK).length,
      unassigned: active.filter((i) => !i.assignedTechnicianId).length,
      escalated: active.filter((i) => i.escalationLevel > 0).length,
      slaCompliancePct: finished.length ? Math.round((met.length / finished.length) * 100) : null,
      avgResponseMinutes: avg(all.map((i) => i.slaTracker?.responseTimeMinutes()).filter((x): x is number => x != null)),
      avgResolutionMinutes: avg(all.map((i) => i.slaTracker?.resolutionTimeMinutes()).filter((x): x is number => x != null)),
      avgFeedbackRating: avg(ratings),
      byStatus: this.countBy(all, (i) => i.status),
      byPriority: this.countBy(all, (i) => i.priority ?? 'NONE'),
      byCategory: this.countBy(all, (i) => i.categoryCode ?? 'UNCLASSIFIED'),
    };
  }

  async technicianWorkload(u: User) {
    this.requireReports(u);
    const techs = (await this.repos.users.findByRoles([Role.TECHNICIAN, Role.TEAM_LEAD])).filter(isTechnician);
    const all = await this.all();
    return techs
      .map((t) => {
        const mine = all.filter((i) => i.assignedTechnicianId === t.id);
        const active = mine.filter((i) => i.isActive());
        const resolved = all.filter((i) => i.resolution?.resolvedById === t.id);
        const ratings = resolved.map((i) => i.feedback?.rating).filter((r): r is number => r != null);
        return {
          technicianId: t.id,
          name: t.name,
          role: t.role,
          skills: t.skills,
          available: t.isAvailable,
          activeIncidents: active.length,
          capacity: t.maxWorkload,
          utilisationPct: Math.round((active.length / t.maxWorkload) * 100),
          p1Active: active.filter((i) => i.priority === Priority.P1).length,
          resolvedTotal: resolved.length,
          slaBreaches: mine.filter((i) => i.slaTracker?.hasBreach).length,
          avgResolutionMinutes: avg(resolved.map((i) => i.slaTracker?.resolutionTimeMinutes()).filter((x): x is number => x != null)),
          avgRating: avg(ratings),
        };
      })
      .sort((a, b) => b.activeIncidents - a.activeIncidents);
  }

  async serviceAnalysis(u: User) {
    this.requireReports(u);
    const services = await this.repos.services.findAll();
    const all = await this.all();
    const now = clock.now();
    return services
      .map((s) => {
        const mine = all.filter((i) => i.serviceId === s.id);
        return {
          serviceId: s.id,
          name: s.name,
          businessCriticality: s.businessCriticality,
          dependsOn: s.dependsOn,
          incidents: mine.length,
          open: mine.filter((i) => i.isActive()).length,
          critical: mine.filter((i) => i.priority === Priority.P1).length,
          slaBreaches: mine.filter((i) => i.slaStatus(now) === SlaStatus.BREACHED).length,
          avgResolutionMinutes: avg(mine.map((i) => i.slaTracker?.resolutionTimeMinutes()).filter((x): x is number => x != null)),
          health: mine.some((i) => i.isActive() && i.priority === Priority.P1) ? 'DOWN' : mine.some((i) => i.isActive()) ? 'DEGRADED' : 'OPERATIONAL',
        };
      })
      .sort((a, b) => b.incidents - a.incidents);
  }

  async trend(u: User, days = 14) {
    this.requireReports(u);
    const all = await this.all();
    const today = clock.now();
    const out: { date: string; created: number; resolved: number; breached: number }[] = [];
    for (let d = days - 1; d >= 0; d--) {
      const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - d);
      const next = new Date(day.getTime() + 86_400_000);
      const inDay = (x: Date | null | undefined) => !!x && x >= day && x < next;
      out.push({
        date: day.toISOString().slice(0, 10),
        created: all.filter((i) => inDay(i.createdAt)).length,
        resolved: all.filter((i) => inDay(i.resolution?.resolvedAt)).length,
        breached: all.filter((i) => i.slaTracker?.hasBreach && inDay(i.createdAt)).length,
      });
    }
    return out;
  }

  async slaViolations(u: User) {
    this.requireReports(u);
    const now = clock.now();
    return (await this.all())
      .filter((i) => i.slaStatus(now) === SlaStatus.BREACHED)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((i) => ({
        id: i.id,
        title: i.title,
        priority: i.priority,
        status: i.status,
        serviceId: i.serviceId,
        assignedTechnicianId: i.assignedTechnicianId,
        responseBreached: i.slaTracker?.responseBreached || i.slaTracker?.isResponseOverdue(now) || false,
        resolutionBreached: i.slaTracker?.resolutionBreached || i.slaTracker?.isResolutionOverdue(now) || false,
        responseDueAt: i.slaTracker?.responseDueAt,
        resolutionDueAt: i.slaTracker?.resolutionDueAt,
        escalationLevel: i.escalationLevel,
        createdAt: i.createdAt,
      }));
  }

  async slaRisk(u: User) {
    if (!u.hasPermission(Permission.REPORT_VIEW) && !isTechnician(u)) throw new AuthorizationError('Not allowed');
    const active = await this.repos.incidents.findActive();
    const workload = await this.repos.incidents.activeWorkload();
    const techs = new Map((await this.repos.users.findByRoles([Role.TECHNICIAN, Role.TEAM_LEAD])).filter(isTechnician).map((t) => [t.id, t]));
    const risks = this.risk.predict(
      active,
      {
        workloadRatio: (id) => (id && techs.get(id) ? (workload.get(id) ?? 0) / techs.get(id)!.maxWorkload : 0),
        avgResolutionMinutesByCategory: await this.avgResolutionByCategory(),
      },
      clock.now(),
    );
    // technicians only see risk on their own incidents
    return u.hasPermission(Permission.REPORT_VIEW) ? risks : risks.filter((r) => r.assignedTechnicianId === u.id);
  }

  async correlations(u: User) {
    this.requireReports(u);
    return this.correlation.correlate(await this.repos.incidents.findActive(), await this.repos.services.findAll(), clock.now());
  }

  async notificationLog(u: User, limit = 100) {
    if (!u.hasPermission(Permission.AUDIT_VIEW)) throw new AuthorizationError('Only administrators can view the notification log');
    return this.repos.notifications.findRecent(limit);
  }

  async exportCsv(u: User, criteria: IncidentSearchCriteria): Promise<string> {
    this.requireReports(u);
    const page = await this.repos.incidents.search({ ...criteria, page: 1, pageSize: 200 });
    const now = clock.now();
    const header = ['id', 'title', 'status', 'priority', 'category', 'service', 'reporter', 'technician', 'createdAt', 'slaStatus', 'resolutionMinutes', 'rating'];
    const esc = (v: unknown) => {
      let s = v == null ? '' : String(v);
      if (/^[=+\-@]/.test(s)) s = `'${s}`; // CSV formula-injection guard
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = page.items.map((i) => {
      const v = i.toView(now);
      return [v.id, v.title, v.status, v.priority, v.categoryCode, v.serviceId, v.reporterName, v.assignedTechnicianName, v.createdAt.toISOString(), v.slaStatus, v.resolutionTimeMinutes?.toFixed(0), v.feedback?.rating]
        .map(esc)
        .join(',');
    });
    return [header.join(','), ...rows].join('\n');
  }

  private countBy(list: Incident[], key: (i: Incident) => string): Record<string, number> {
    const out: Record<string, number> = {};
    list.forEach((i) => (out[key(i)] = (out[key(i)] ?? 0) + 1));
    return out;
  }
}
