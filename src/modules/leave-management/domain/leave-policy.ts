import { addDays, daysBetween, type Day } from './leave-dates';
import { LeaveType } from './leave-type';

export interface LeaveDraft {
  from: Day;
  to: Day;
  /** Working days, already computed (0.5 for a half day). */
  days: number;
  halfDay: boolean;
}

/**
 * Strategy: the rules that differ per leave type. Returns a human-readable violation,
 * or null if the request is fine. Rules shared by every type (to ≥ from, balance,
 * overlap) stay in the service; only what VARIES lives here.
 */
export interface LeavePolicy {
  readonly type: LeaveType;
  violation(draft: LeaveDraft, today: Day): string | null;
}

export const LEAVE_POLICIES = Symbol('LEAVE_POLICIES');

/** Planned short breaks: not in the past, at most 3 working days at a time. */
export class CasualLeavePolicy implements LeavePolicy {
  readonly type = LeaveType.CASUAL;
  static readonly MAX_DAYS = 3;

  violation(d: LeaveDraft, today: Day): string | null {
    if (d.from < today) return 'CASUAL leave cannot be backdated';
    if (d.days > CasualLeavePolicy.MAX_DAYS) {
      return `CASUAL leave is at most ${CasualLeavePolicy.MAX_DAYS} working days per request`;
    }
    return null;
  }
}

/** You don't know in advance that you'll be ill: may be applied up to 7 days after. */
export class SickLeavePolicy implements LeavePolicy {
  readonly type = LeaveType.SICK;
  static readonly MAX_BACKDATE_DAYS = 7;

  violation(d: LeaveDraft, today: Day): string | null {
    if (d.from < addDays(today, -SickLeavePolicy.MAX_BACKDATE_DAYS)) {
      return `SICK leave can be backdated by at most ${SickLeavePolicy.MAX_BACKDATE_DAYS} days`;
    }
    return null;
  }
}

/** Long planned leave: the team needs notice. */
export class EarnedLeavePolicy implements LeavePolicy {
  readonly type = LeaveType.EARNED;
  static readonly NOTICE_DAYS = 7;

  violation(d: LeaveDraft, today: Day): string | null {
    if (daysBetween(today, d.from) < EarnedLeavePolicy.NOTICE_DAYS) {
      return `EARNED leave needs ${EarnedLeavePolicy.NOTICE_DAYS} days notice`;
    }
    return null;
  }
}

export const LEAVE_POLICY_CLASSES = [
  CasualLeavePolicy,
  SickLeavePolicy,
  EarnedLeavePolicy,
];
