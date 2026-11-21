/**
 * Clock abstraction so time-dependent rules (SLA deadlines, escalation) can be
 * tested deterministically. Production code uses the system clock.
 */
export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current.getTime());
  }
  advanceMinutes(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }
  set(date: Date): void {
    this.current = new Date(date.getTime());
  }
}

let activeClock: Clock = new SystemClock();

/** Global access point used by the domain model. */
export const clock = {
  now: (): Date => activeClock.now(),
  use: (c: Clock): void => {
    activeClock = c;
  },
  reset: (): void => {
    activeClock = new SystemClock();
  },
};

export const minutesBetween = (a: Date, b: Date): number => (b.getTime() - a.getTime()) / 60_000;
export const addMinutes = (d: Date, m: number): Date => new Date(d.getTime() + m * 60_000);
