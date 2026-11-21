import { EventBus } from '../domain/events/EventBus';
import { IncidentRepository } from '../persistence/repositories';
import { EscalationService } from './EscalationService';

export interface MonitorRunResult {
  checked: number;
  warnings: number;
  breaches: number;
  escalations: number;
}

/**
 * Background job for continuous SLA monitoring. Every interval it scans the
 * open incidents, raises warnings before deadlines, records violations and
 * triggers automatic escalation. All side effects are published as events.
 */
export class SlaMonitor {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  lastRun: (MonitorRunResult & { at: Date }) | null = null;

  constructor(
    private readonly incidents: IncidentRepository,
    private readonly escalation: EscalationService,
    private readonly bus: EventBus,
  ) {}

  start(intervalMs: number): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.runOnce().catch((e) => console.error('[sla-monitor] run failed:', (e as Error).message));
    }, intervalMs);
    this.timer.unref?.();
    console.log(`[sla-monitor] started (every ${Math.round(intervalMs / 1000)}s)`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce(): Promise<MonitorRunResult> {
    if (this.running) return { checked: 0, warnings: 0, breaches: 0, escalations: 0 };
    this.running = true;
    const result: MonitorRunResult = { checked: 0, warnings: 0, breaches: 0, escalations: 0 };
    try {
      const active = await this.incidents.findActive();
      for (const incident of active) {
        result.checked++;
        let changed = false;
        if (incident.flagSlaBreaches()) {
          result.breaches++;
          changed = true;
        }
        if (incident.flagSlaWarning()) {
          result.warnings++;
          changed = true;
        }
        if (this.escalation.evaluate(incident)) {
          result.escalations++;
          changed = true;
        }
        if (changed) {
          await this.incidents.save(incident);
          await this.bus.publishAll(incident.pullEvents());
        }
      }
      this.lastRun = { ...result, at: new Date() };
      return result;
    } finally {
      this.running = false;
    }
  }
}
