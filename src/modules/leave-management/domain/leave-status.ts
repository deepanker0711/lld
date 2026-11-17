import { ConflictError } from '../../../common/errors/domain.errors';

export enum LeaveStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

/**
 * State pattern as a table (same shape as the job scheduler's).
 *
 *   ──► PENDING ──┬──► APPROVED ──► CANCELLED   (only while the leave hasn't started: a guard in the service)
 *                 ├──► REJECTED
 *                 └──► CANCELLED
 *
 * The table says which moves exist at all; time-based rules ("start date in the
 * future") are guards checked on top, because a table can't express them.
 */
export const LEAVE_TRANSITIONS: Record<LeaveStatus, readonly LeaveStatus[]> = {
  [LeaveStatus.PENDING]: [
    LeaveStatus.APPROVED,
    LeaveStatus.REJECTED,
    LeaveStatus.CANCELLED,
  ],
  [LeaveStatus.APPROVED]: [LeaveStatus.CANCELLED],
  [LeaveStatus.REJECTED]: [],
  [LeaveStatus.CANCELLED]: [],
};

/** Statuses that hold days (count for overlap and balance). */
export const ACTIVE_LEAVE_STATUSES: readonly LeaveStatus[] = [
  LeaveStatus.PENDING,
  LeaveStatus.APPROVED,
];

/** 409 with the allowed moves, so the client sees why. */
export function assertLeaveTransition(
  from: LeaveStatus,
  to: LeaveStatus,
  leaveId: string,
): void {
  const allowed = LEAVE_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new ConflictError(
      `Leave '${leaveId}' cannot move from ${from} to ${to}`,
      { from, to, allowed },
    );
  }
}
