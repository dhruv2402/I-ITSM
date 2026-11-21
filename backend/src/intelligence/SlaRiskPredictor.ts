import { IncidentStatus } from '../domain/enums';
import { Incident } from '../domain/incident/Incident';

export interface SlaRisk {
  incidentId: string;
  title: string;
  priority: string | null;
  status: IncidentStatus;
  assignedTechnicianId: string | null;
  riskScore: number;
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'BREACHED';
  minutesLeft: number;
  reasons: string[];
}

const STATUS_RISK: Partial<Record<IncidentStatus, number>> = {
  [IncidentStatus.NEW]: 1,
  [IncidentStatus.CLASSIFIED]: 1,
  [IncidentStatus.ASSIGNED]: 0.8,
  [IncidentStatus.ACKNOWLEDGED]: 0.5,
  [IncidentStatus.IN_PROGRESS]: 0.3,
  [IncidentStatus.PENDING_INFO]: 0.2,
};

/**
 * Intelligent feature E - Predictive SLA risk detection.
 * risk = 0.5 x time used + 0.2 x lifecycle stage + 0.15 x technician load
 *      + 0.15 x historical difficulty (avg resolution time of the category vs. the SLA window)
 */
export class SlaRiskPredictor {
  predict(
    active: Incident[],
    context: { workloadRatio: (techId: string | null) => number; avgResolutionMinutesByCategory: Map<string, number> },
    now: Date = new Date(),
  ): SlaRisk[] {
    return active
      .filter((i) => i.slaTracker && i.isActive() && i.status !== IncidentStatus.RESOLVED)
      .map((i) => {
        const sla = i.slaTracker!;
        const reasons: string[] = [];
        const minutesLeft = Math.round(sla.minutesToResolutionDeadline(now));
        if (sla.hasBreach || sla.isResolutionOverdue(now) || sla.isResponseOverdue(now)) {
          return this.result(i, 1, 'BREACHED', minutesLeft, ['SLA already violated']);
        }
        const time = Math.min(1, Math.max(0, sla.elapsedFraction(now)));
        reasons.push(`${Math.round(time * 100)}% of resolution window used`);
        const stage = STATUS_RISK[i.status] ?? 0.3;
        if (stage >= 0.8) reasons.push(i.assignedTechnicianId ? 'Not yet acknowledged' : 'No technician assigned');
        const load = Math.min(1, context.workloadRatio(i.assignedTechnicianId));
        if (load >= 0.8) reasons.push(`Assigned technician is at ${Math.round(load * 100)}% capacity`);
        const avg = i.categoryCode ? context.avgResolutionMinutesByCategory.get(i.categoryCode) : undefined;
        const difficulty = avg ? Math.min(1, avg / sla.resolutionMinutes) : 0.5;
        if (avg && avg > sla.resolutionMinutes * 0.7) {
          reasons.push(`${i.categoryCode} incidents usually take ${Math.round(avg)} min (SLA ${sla.resolutionMinutes} min)`);
        }
        const score = 0.5 * time + 0.2 * stage + 0.15 * load + 0.15 * difficulty;
        const level = score >= 0.65 ? 'HIGH' : score >= 0.45 ? 'MEDIUM' : 'LOW';
        return this.result(i, score, level, minutesLeft, reasons);
      })
      .sort((a, b) => b.riskScore - a.riskScore);
  }

  private result(i: Incident, score: number, level: SlaRisk['level'], minutesLeft: number, reasons: string[]): SlaRisk {
    return {
      incidentId: i.id,
      title: i.title,
      priority: i.priority,
      status: i.status,
      assignedTechnicianId: i.assignedTechnicianId,
      riskScore: Math.round(score * 100) / 100,
      level,
      minutesLeft,
      reasons,
    };
  }
}
