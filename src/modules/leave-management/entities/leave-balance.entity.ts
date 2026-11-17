import { BaseEntity } from '../../../common/entities/base.entity';
import { LeaveType } from '../domain/leave-type';

/**
 * One row per (employee, type, year); id = "empId:TYPE:2026" so lookup is a Map get.
 *
 *   available = allotted − used − pending
 *
 * `pending` reserves days at apply time. Without it, an employee with 2 days left could
 * file five 2-day requests and the manager could approve all of them.
 */
export class LeaveBalance extends BaseEntity {
  employeeId: string;
  type: LeaveType;
  year: number;
  allotted: number;
  used: number;
  pending: number;
}

export function balanceId(
  employeeId: string,
  type: LeaveType,
  year: number,
): string {
  return `${employeeId}:${type}:${year}`;
}

export function availableOf(b: LeaveBalance): number {
  return b.allotted - b.used - b.pending;
}
