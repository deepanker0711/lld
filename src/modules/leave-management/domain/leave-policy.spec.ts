import { LeavePolicyRegistry } from '../leave-policy-registry.service';
import {
  CasualLeavePolicy,
  EarnedLeavePolicy,
  type LeaveDraft,
  SickLeavePolicy,
} from './leave-policy';

const TODAY = '2026-11-02';
const draft = (from: string, days = 1): LeaveDraft => ({
  from,
  to: from,
  days,
  halfDay: false,
});

describe('leave policies', () => {
  it('CASUAL: no backdating, at most 3 working days', () => {
    const p = new CasualLeavePolicy();
    expect(p.violation(draft(TODAY), TODAY)).toBeNull();
    expect(p.violation(draft('2026-11-01'), TODAY)).toBe(
      'CASUAL leave cannot be backdated',
    );
    expect(p.violation(draft('2026-11-03', 3), TODAY)).toBeNull();
    expect(p.violation(draft('2026-11-03', 4), TODAY)).toBe(
      'CASUAL leave is at most 3 working days per request',
    );
  });

  it('SICK: backdated up to 7 days, not 8', () => {
    const p = new SickLeavePolicy();
    expect(p.violation(draft('2026-10-26'), TODAY)).toBeNull();
    expect(p.violation(draft('2026-10-25'), TODAY)).toBe(
      'SICK leave can be backdated by at most 7 days',
    );
    expect(p.violation(draft('2026-12-01', 10), TODAY)).toBeNull();
  });

  it('EARNED: needs 7 days notice', () => {
    const p = new EarnedLeavePolicy();
    expect(p.violation(draft('2026-11-09'), TODAY)).toBeNull();
    expect(p.violation(draft('2026-11-08'), TODAY)).toBe(
      'EARNED leave needs 7 days notice',
    );
  });

  it('registry fails at boot on a duplicate or a missing type', () => {
    const casual = new CasualLeavePolicy();
    expect(() => new LeavePolicyRegistry([casual, casual])).toThrow(
      "Duplicate leave policy for 'CASUAL'",
    );
    expect(
      () => new LeavePolicyRegistry([casual, new SickLeavePolicy()]),
    ).toThrow('No leave policy for: EARNED');
  });
});
