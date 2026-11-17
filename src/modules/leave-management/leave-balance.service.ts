import { Inject, Injectable } from '@nestjs/common';
import { LEAVE_OPTIONS, type LeaveOptions } from './domain/leave-options';
import { ALL_LEAVE_TYPES, LeaveType } from './domain/leave-type';
import {
  availableOf,
  balanceId,
  LeaveBalance,
} from './entities/leave-balance.entity';
import { LeaveBalanceRepository } from './leave-balance.repository';

export type BalanceView = Pick<
  LeaveBalance,
  'type' | 'year' | 'allotted' | 'used' | 'pending'
> & { available: number };

/**
 * The ledger. Every balance change in the module goes through one of four named moves,
 * so "where can `used` change?" has a one-line answer:
 *
 *   apply             reserve  pending += d
 *   approve           confirm  pending -= d, used += d
 *   reject / cancel   release  pending -= d          (cancel a PENDING leave)
 *   cancel            refund   used -= d             (cancel an APPROVED leave)
 */
@Injectable()
export class LeaveBalanceService {
  constructor(
    private readonly balances: LeaveBalanceRepository,
    @Inject(LEAVE_OPTIONS) private readonly options: LeaveOptions,
  ) {}

  /** Created from the quota on first use, so a new year (or a new employee) needs no batch job. */
  get(employeeId: string, type: LeaveType, year: number): LeaveBalance {
    return (
      this.balances.find(employeeId, type, year) ??
      this.balances.create({
        id: balanceId(employeeId, type, year),
        employeeId,
        type,
        year,
        allotted: this.options.quotas[type],
        used: 0,
        pending: 0,
      })
    );
  }

  seedYear(employeeId: string, year: number): void {
    for (const type of ALL_LEAVE_TYPES) this.get(employeeId, type, year);
  }

  view(employeeId: string, year: number): BalanceView[] {
    return ALL_LEAVE_TYPES.map((type) => {
      const b = this.get(employeeId, type, year);
      return {
        type,
        year,
        allotted: b.allotted,
        used: b.used,
        pending: b.pending,
        available: availableOf(b),
      };
    });
  }

  reserve(b: LeaveBalance, days: number): void {
    this.balances.update(b.id, { pending: b.pending + days });
  }

  confirm(b: LeaveBalance, days: number): void {
    this.balances.update(b.id, {
      pending: b.pending - days,
      used: b.used + days,
    });
  }

  release(b: LeaveBalance, days: number): void {
    this.balances.update(b.id, { pending: b.pending - days });
  }

  refund(b: LeaveBalance, days: number): void {
    this.balances.update(b.id, { used: b.used - days });
  }
}
