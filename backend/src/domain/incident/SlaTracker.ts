import { addMinutes } from '../../shared/clock';
import { SlaPolicy } from '../catalog/SlaPolicy';
import { SlaStatus } from '../enums';

export interface SlaSnapshot {
  policyId: string;
  policyName: string;
  responseMinutes: number;
  resolutionMinutes: number;
  warningThresholdPct: number;
  startedAt: Date;
  responseDueAt: Date;
  resolutionDueAt: Date;
  respondedAt: Date | null;
  resolvedAt: Date | null;
  pausedAt: Date | null;
  totalPausedMinutes: number;
  warningIssued: boolean;
  responseBreached: boolean;
  resolutionBreached: boolean;
}

/**
 * Tracks one incident's SLA: deadlines, response/resolution times, pauses and
 * breaches. Owned by the Incident (composition): it is created with the
 * incident's SLA and never shared.
 */
export class SlaTracker {
  private constructor(private s: SlaSnapshot) {}

  static start(policy: SlaPolicy, startedAt: Date): SlaTracker {
    return new SlaTracker({
      policyId: policy.id,
      policyName: policy.name,
      responseMinutes: policy.responseMinutes,
      resolutionMinutes: policy.resolutionMinutes,
      warningThresholdPct: policy.warningThresholdPct,
      startedAt,
      responseDueAt: addMinutes(startedAt, policy.responseMinutes),
      resolutionDueAt: addMinutes(startedAt, policy.resolutionMinutes),
      respondedAt: null,
      resolvedAt: null,
      pausedAt: null,
      totalPausedMinutes: 0,
      warningIssued: false,
      responseBreached: false,
      resolutionBreached: false,
    });
  }

  static fromSnapshot(s: SlaSnapshot): SlaTracker {
    const d = (v: Date | string | null) => (v ? new Date(v) : null);
    return new SlaTracker({
      ...s,
      startedAt: new Date(s.startedAt),
      responseDueAt: new Date(s.responseDueAt),
      resolutionDueAt: new Date(s.resolutionDueAt),
      respondedAt: d(s.respondedAt),
      resolvedAt: d(s.resolvedAt),
      pausedAt: d(s.pausedAt),
    });
  }

  /** Re-applies a (new) policy, e.g. after the priority changed, keeping the original start time. */
  rebase(policy: SlaPolicy): void {
    this.s.policyId = policy.id;
    this.s.policyName = policy.name;
    this.s.responseMinutes = policy.responseMinutes;
    this.s.resolutionMinutes = policy.resolutionMinutes;
    this.s.warningThresholdPct = policy.warningThresholdPct;
    this.s.responseDueAt = addMinutes(this.s.startedAt, policy.responseMinutes);
    this.s.resolutionDueAt = addMinutes(this.s.startedAt, policy.resolutionMinutes + this.s.totalPausedMinutes);
    this.s.warningIssued = false;
  }

  get responseDueAt(): Date {
    return this.s.responseDueAt;
  }
  get resolutionDueAt(): Date {
    return this.s.resolutionDueAt;
  }
  get respondedAt(): Date | null {
    return this.s.respondedAt;
  }
  get resolvedAt(): Date | null {
    return this.s.resolvedAt;
  }
  get isPaused(): boolean {
    return this.s.pausedAt !== null;
  }
  get warningIssued(): boolean {
    return this.s.warningIssued;
  }
  get responseBreached(): boolean {
    return this.s.responseBreached;
  }
  get resolutionBreached(): boolean {
    return this.s.resolutionBreached;
  }
  get hasBreach(): boolean {
    return this.s.responseBreached || this.s.resolutionBreached;
  }
  get policyName(): string {
    return this.s.policyName;
  }
  get resolutionMinutes(): number {
    return this.s.resolutionMinutes;
  }
  get responseMinutes(): number {
    return this.s.responseMinutes;
  }
  get warningThresholdPct(): number {
    return this.s.warningThresholdPct;
  }

  markResponded(at: Date): void {
    if (!this.s.respondedAt) {
      this.s.respondedAt = at;
      if (at > this.s.responseDueAt) this.s.responseBreached = true;
    }
  }

  markResolved(at: Date): void {
    if (this.s.pausedAt) this.resume(at);
    this.s.resolvedAt = at;
    if (at > this.s.resolutionDueAt) this.s.resolutionBreached = true;
  }

  clearResolution(): void {
    this.s.resolvedAt = null;
  }

  pause(at: Date): void {
    if (!this.s.pausedAt) this.s.pausedAt = at;
  }

  /** Resuming pushes the resolution deadline out by the paused duration. */
  resume(at: Date): void {
    if (!this.s.pausedAt) return;
    const paused = Math.max(0, (at.getTime() - this.s.pausedAt.getTime()) / 60_000);
    this.s.totalPausedMinutes += paused;
    this.s.resolutionDueAt = addMinutes(this.s.resolutionDueAt, paused);
    this.s.pausedAt = null;
  }

  /** Minutes taken to first respond (acknowledge), if responded. */
  responseTimeMinutes(): number | null {
    return this.s.respondedAt ? (this.s.respondedAt.getTime() - this.s.startedAt.getTime()) / 60_000 : null;
  }

  /** Minutes taken to resolve, excluding paused time. */
  resolutionTimeMinutes(): number | null {
    if (!this.s.resolvedAt) return null;
    return (this.s.resolvedAt.getTime() - this.s.startedAt.getTime()) / 60_000 - this.s.totalPausedMinutes;
  }

  /** Fraction (0..1+) of the resolution window used so far. */
  elapsedFraction(now: Date): number {
    const effectiveNow = this.s.resolvedAt ?? this.s.pausedAt ?? now;
    const total = this.s.resolutionDueAt.getTime() - this.s.startedAt.getTime();
    if (total <= 0) return 1;
    return (effectiveNow.getTime() - this.s.startedAt.getTime()) / total;
  }

  minutesToResolutionDeadline(now: Date): number {
    return (this.s.resolutionDueAt.getTime() - now.getTime()) / 60_000;
  }

  isResponseOverdue(now: Date): boolean {
    return !this.s.respondedAt && now > this.s.responseDueAt;
  }

  isResolutionOverdue(now: Date): boolean {
    return !this.s.resolvedAt && !this.s.pausedAt && now > this.s.resolutionDueAt;
  }

  shouldWarn(now: Date): boolean {
    return (
      !this.s.warningIssued &&
      !this.s.resolvedAt &&
      !this.s.pausedAt &&
      !this.s.resolutionBreached &&
      this.elapsedFraction(now) * 100 >= this.s.warningThresholdPct
    );
  }

  flagWarning(): void {
    this.s.warningIssued = true;
  }
  flagResponseBreach(): void {
    this.s.responseBreached = true;
  }
  flagResolutionBreach(): void {
    this.s.resolutionBreached = true;
  }

  status(now: Date): SlaStatus {
    if (this.hasBreach || this.isResolutionOverdue(now) || this.isResponseOverdue(now)) return SlaStatus.BREACHED;
    if (this.s.resolvedAt) return SlaStatus.MET;
    if (this.s.pausedAt) return SlaStatus.PAUSED;
    if (this.elapsedFraction(now) * 100 >= this.s.warningThresholdPct) return SlaStatus.AT_RISK;
    return SlaStatus.ON_TRACK;
  }

  toSnapshot(): SlaSnapshot {
    return { ...this.s };
  }
}
