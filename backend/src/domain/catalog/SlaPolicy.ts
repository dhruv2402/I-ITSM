import { Priority } from '../enums';
import { ValidationError } from '../errors';

export interface SlaPolicySnapshot {
  id: string;
  name: string;
  priority: Priority;
  /** null = default policy that applies to every service without a specific one. */
  serviceId: string | null;
  responseMinutes: number;
  resolutionMinutes: number;
  /** A warning is raised once this percentage of the resolution window has elapsed. */
  warningThresholdPct: number;
  active: boolean;
}

/** Service Level Agreement targets for one priority (optionally for one service). */
export class SlaPolicy {
  private constructor(private props: SlaPolicySnapshot) {
    SlaPolicy.validate(props);
  }

  static create(s: SlaPolicySnapshot): SlaPolicy {
    return new SlaPolicy({ ...s, serviceId: s.serviceId || null });
  }

  private static validate(s: SlaPolicySnapshot): void {
    if (!Object.values(Priority).includes(s.priority)) throw new ValidationError('Unknown priority');
    if (!(s.responseMinutes > 0)) throw new ValidationError('Response target must be greater than 0 minutes');
    if (!(s.resolutionMinutes > 0)) throw new ValidationError('Resolution target must be greater than 0 minutes');
    if (s.resolutionMinutes < s.responseMinutes) {
      throw new ValidationError('Resolution target cannot be shorter than the response target');
    }
    if (!(s.warningThresholdPct >= 10 && s.warningThresholdPct <= 99)) {
      throw new ValidationError('Warning threshold must be between 10% and 99%');
    }
  }

  get id(): string {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }
  get priority(): Priority {
    return this.props.priority;
  }
  get serviceId(): string | null {
    return this.props.serviceId;
  }
  get responseMinutes(): number {
    return this.props.responseMinutes;
  }
  get resolutionMinutes(): number {
    return this.props.resolutionMinutes;
  }
  get warningThresholdPct(): number {
    return this.props.warningThresholdPct;
  }
  get isActive(): boolean {
    return this.props.active;
  }
  get isDefault(): boolean {
    return this.props.serviceId === null;
  }

  update(changes: Partial<Omit<SlaPolicySnapshot, 'id'>>): void {
    const next = { ...this.props, ...changes };
    next.serviceId = next.serviceId || null;
    SlaPolicy.validate(next);
    this.props = next;
  }

  toSnapshot(): SlaPolicySnapshot {
    return { ...this.props };
  }
}
