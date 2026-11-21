import { ItService } from '../domain/catalog/ItService';
import { Incident } from '../domain/incident/Incident';

export interface CorrelationCluster {
  key: string;
  type: 'SAME_SERVICE' | 'SHARED_DEPENDENCY';
  serviceId: string;
  serviceName: string;
  incidentIds: string[];
  affectedServices: string[];
  probableRootCause: string;
  confidence: number;
}

/**
 * Intelligent feature B - Incident correlation + automated root-cause hint.
 *
 * Uses the service dependency graph (Payment -> Auth -> Database -> Network ...):
 *  1. SAME_SERVICE: several open incidents on one service within the time window.
 *  2. SHARED_DEPENDENCY: an upstream service that has its own open incident(s)
 *     AND, within +/- burstMinutes of its first report, incidents on at least two
 *     services that (transitively) depend on it -> probable root cause.
 *     Requiring a direct report plus time proximity stops very generic
 *     dependencies (e.g. the network, which everything depends on) from
 *     "explaining" unrelated incidents.
 */
export class CorrelationEngine {
  constructor(
    private readonly windowMinutes = 240,
    private readonly burstMinutes = 90,
  ) {}

  /** Transitive closure of dependencies (DFS, cycle safe). */
  static upstreamOf(serviceId: string, services: Map<string, ItService>): Set<string> {
    const seen = new Set<string>();
    const stack = [...(services.get(serviceId)?.dependsOn ?? [])];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id) || id === serviceId) continue;
      seen.add(id);
      stack.push(...(services.get(id)?.dependsOn ?? []));
    }
    return seen;
  }

  correlate(incidents: Incident[], serviceList: ItService[], now: Date = new Date()): CorrelationCluster[] {
    const services = new Map(serviceList.map((s) => [s.id, s]));
    const since = now.getTime() - this.windowMinutes * 60_000;
    const recent = incidents.filter((i) => i.isActive() && i.createdAt.getTime() >= since);
    const clusters: CorrelationCluster[] = [];
    const name = (id: string) => services.get(id)?.name ?? id;

    // 1. same service
    const byService = new Map<string, Incident[]>();
    recent.forEach((i) => byService.set(i.serviceId, [...(byService.get(i.serviceId) ?? []), i]));
    byService.forEach((list, sid) => {
      if (list.length >= 2) {
        clusters.push({
          key: `SVC:${sid}`,
          type: 'SAME_SERVICE',
          serviceId: sid,
          serviceName: name(sid),
          incidentIds: list.map((i) => i.id),
          affectedServices: [sid],
          probableRootCause: `${list.length} open incidents on ${name(sid)} - likely one underlying outage`,
          confidence: Math.min(0.95, 0.5 + 0.15 * (list.length - 1)),
        });
      }
    });

    // 2. shared upstream dependency
    const upstreamCache = new Map<string, Set<string>>();
    const upstream = (sid: string) => {
      if (!upstreamCache.has(sid)) upstreamCache.set(sid, CorrelationEngine.upstreamOf(sid, services));
      return upstreamCache.get(sid)!;
    };
    for (const candidate of services.values()) {
      const directReports = recent.filter((i) => i.serviceId === candidate.id);
      if (directReports.length === 0) continue;
      const anchor = Math.min(...directReports.map((i) => i.createdAt.getTime()));
      const related = recent.filter(
        (i) =>
          i.serviceId === candidate.id ||
          (upstream(i.serviceId).has(candidate.id) && Math.abs(i.createdAt.getTime() - anchor) <= this.burstMinutes * 60_000),
      );
      const distinctServices = [...new Set(related.map((i) => i.serviceId))];
      if (related.length >= 3 && distinctServices.length >= 3) {
        const direct = directReports.length;
        clusters.push({
          key: `DEP:${candidate.id}`,
          type: 'SHARED_DEPENDENCY',
          serviceId: candidate.id,
          serviceName: candidate.name,
          incidentIds: related.map((i) => i.id),
          affectedServices: distinctServices,
          probableRootCause: `${related.length} incidents across ${distinctServices.length} services all depend on ${candidate.name}${
            direct ? ` (${direct} reported on it directly)` : ''
          } - probable root cause`,
          confidence: Math.min(0.9, 0.4 + 0.1 * distinctServices.length + (direct ? 0.15 : 0)),
        });
      }
    }

    // Several upstream services can explain the same incidents (DB, Network, Storage...).
    // Keep only the best explanation: drop a cluster covered by another one with higher confidence
    // (a service that has direct reports is a more likely root cause than one nobody reported).
    const dep = clusters.filter((c) => c.type === 'SHARED_DEPENDENCY');
    const better = (o: CorrelationCluster, c: CorrelationCluster) =>
      o.confidence > c.confidence ||
      (o.confidence === c.confidence && (o.incidentIds.length > c.incidentIds.length || (o.incidentIds.length === c.incidentIds.length && o.key < c.key)));
    const pruned = dep.filter((c) => !dep.some((o) => o !== c && c.incidentIds.every((id) => o.incidentIds.includes(id)) && better(o, c)));
    return [...clusters.filter((c) => c.type === 'SAME_SERVICE'), ...pruned].sort((a, b) => b.confidence - a.confidence);
  }
}
