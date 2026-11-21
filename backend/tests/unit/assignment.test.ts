import { Priority, Role } from '../../src/domain/enums';
import { Technician } from '../../src/domain/user/Technician';
import { AssignmentContext, TechnicianCandidate } from '../../src/strategies/assignment/AssignmentStrategy';
import { AssignmentStrategyRegistry } from '../../src/strategies/assignment/AssignmentStrategyRegistry';
import { LoadBasedStrategy } from '../../src/strategies/assignment/LoadBasedStrategy';
import { RoundRobinStrategy } from '../../src/strategies/assignment/RoundRobinStrategy';
import { SkillBasedStrategy } from '../../src/strategies/assignment/SkillBasedStrategy';
import { SmartAssignmentStrategy } from '../../src/strategies/assignment/SmartAssignmentStrategy';
import { makeUser } from '../helpers';

const tech = (skills: string[], exp: number, max = 5, available = true) =>
  makeUser(Role.TECHNICIAN, { skills, experienceYears: exp, maxWorkload: max, available }) as Technician;

const cand = (t: Technician, load: number, svcHistory = 0): TechnicianCandidate => ({
  technician: t,
  activeWorkload: load,
  resolvedForService: svcHistory,
  resolvedInCategory: 0,
});

const ctx: AssignmentContext = { incidentId: 'INC1', categoryCode: 'DATABASE', serviceId: 'SVC-DB', priority: Priority.P1 };

describe('Technician assignment (Strategy + Template Method)', () => {
  const dba = tech(['DATABASE'], 2);
  const seniorDba = tech(['DATABASE', 'STORAGE'], 9);
  const netEng = tech(['NETWORK'], 6);
  const offDuty = tech(['DATABASE'], 10, 5, false);

  test('TC08 skill-based only picks technicians with the matching skill, least loaded first', () => {
    const r = new SkillBasedStrategy().rank(ctx, [cand(dba, 3), cand(seniorDba, 1), cand(netEng, 0)]);
    expect(r.map((x) => x.technicianId)).toEqual([seniorDba.id, dba.id]);
  });

  test('load-based picks the lowest utilisation regardless of skill', () => {
    const r = new LoadBasedStrategy().select(ctx, [cand(dba, 3), cand(seniorDba, 2), cand(netEng, 0)]);
    expect(r!.technicianId).toBe(netEng.id);
  });

  test('TC09 unavailable or full technicians are never chosen (workload exceeded boundary)', () => {
    const full = tech(['DATABASE'], 8, 3);
    const r = new SkillBasedStrategy().rank(ctx, [cand(offDuty, 0), cand(full, 3)]);
    expect(r).toHaveLength(0);
    expect(new SkillBasedStrategy().select(ctx, [cand(full, 2)])!.technicianId).toBe(full.id); // 2 < 3 still fits
  });

  test('round-robin rotates through skilled technicians', () => {
    const rr = new RoundRobinStrategy();
    const pool = [cand(dba, 0), cand(seniorDba, 0)];
    const first = rr.select(ctx, pool)!.technicianId;
    const second = rr.select(ctx, pool)!.technicianId;
    const third = rr.select(ctx, pool)!.technicianId;
    expect(first).not.toBe(second);
    expect(third).toBe(first);
  });

  test('smart strategy prefers skill + experience + history and explains why', () => {
    const r = new SmartAssignmentStrategy().rank(ctx, [cand(dba, 0), cand(seniorDba, 2, 5), cand(netEng, 0)]);
    expect(r[0].technicianId).toBe(seniorDba.id);
    expect(r[0].reasons.join(' ')).toMatch(/Skill match/);
    expect(r[r.length - 1].technicianId).toBe(netEng.id);
  });

  test('registry allows switching strategies at runtime', () => {
    const reg = new AssignmentStrategyRegistry();
    expect(reg.active.key).toBe('SMART');
    reg.use('ROUND_ROBIN');
    expect(reg.active.key).toBe('ROUND_ROBIN');
    expect(() => reg.use('UNKNOWN')).toThrow();
    expect(reg.list().filter((s) => s.active)).toHaveLength(1);
  });
});
