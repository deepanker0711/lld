import { BaseEntity } from '../../../common/entities/base.entity';
import { LeaveStatus } from '../domain/leave-status';
import { LeaveType } from '../domain/leave-type';

/** Audit trail entry: HR always asks "who approved this, and when?" */
export interface LeaveHistoryEntry {
  status: LeaveStatus;
  at: Date;
  by: string;
  comment: string | null;
}

export class LeaveRequest extends BaseEntity {
  employeeId: string;
  type: LeaveType;
  /** Inclusive calendar days, YYYY-MM-DD. */
  from: string;
  to: string;
  halfDay: boolean;
  /** Working days charged to the balance (0.5 for a half day). Fixed at apply time. */
  days: number;
  reason: string;
  status: LeaveStatus;
  /** The manager who approved or rejected. */
  approverId: string | null;
  decidedAt: Date | null;
  comment: string | null;
  history: LeaveHistoryEntry[];
}
