import { isLevel, Level } from '../enums';
import { ValidationError } from '../errors';

export interface ItServiceSnapshot {
  id: string;
  name: string;
  description: string;
  businessCriticality: Level;
  ownerTeam: string;
  userBase: number;
  dependsOn: string[];
  active: boolean;
}

/** An IT service offered by the organisation (Payment Gateway, SSO, Database...). */
export class ItService {
  private constructor(private props: ItServiceSnapshot) {
    ItService.validate(props);
  }

  static create(s: ItServiceSnapshot): ItService {
    return new ItService({ ...s, dependsOn: [...new Set(s.dependsOn ?? [])].filter((d) => d !== s.id) });
  }

  private static validate(s: ItServiceSnapshot): void {
    if (!/^[A-Z0-9-]{2,20}$/.test(s.id)) throw new ValidationError('Service id must be 2-20 upper-case letters, digits or dashes');
    if (!s.name || s.name.trim().length < 2) throw new ValidationError('Service name is required');
    if (!isLevel(s.businessCriticality)) throw new ValidationError('Business criticality must be 1-4');
    if (!Number.isInteger(s.userBase) || s.userBase < 0) throw new ValidationError('User base must be a non-negative integer');
  }

  get id(): string {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }
  get businessCriticality(): Level {
    return this.props.businessCriticality;
  }
  get userBase(): number {
    return this.props.userBase;
  }
  get dependsOn(): string[] {
    return [...this.props.dependsOn];
  }
  get isActive(): boolean {
    return this.props.active;
  }

  update(changes: Partial<Omit<ItServiceSnapshot, 'id'>>): void {
    const next = { ...this.props, ...changes };
    next.dependsOn = [...new Set(next.dependsOn)].filter((d) => d !== next.id);
    ItService.validate(next);
    this.props = next;
  }

  toSnapshot(): ItServiceSnapshot {
    return { ...this.props, dependsOn: [...this.props.dependsOn] };
  }
}
