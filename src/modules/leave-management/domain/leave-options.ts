import { LeaveType } from './leave-type';

export interface LeaveOptions {
  /** Days per calendar year, seeded into each employee's balance. */
  quotas: Record<LeaveType, number>;
  /** "Today" for notice periods and cancel rules is the date in this zone. */
  timeZone: string;
  /** Company holidays (YYYY-MM-DD); not counted as leave days. */
  holidays: string[];
}

export const DEFAULT_LEAVE_OPTIONS: LeaveOptions = {
  quotas: {
    [LeaveType.CASUAL]: 12,
    [LeaveType.SICK]: 10,
    [LeaveType.EARNED]: 15,
  },
  timeZone: 'Asia/Kolkata',
  holidays: ['2026-11-09', '2026-12-25'], // demo: Diwali (approx.), Christmas
};

export const LEAVE_OPTIONS = Symbol('LEAVE_OPTIONS');
