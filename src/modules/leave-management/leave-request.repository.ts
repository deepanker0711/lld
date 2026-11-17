import { Injectable } from '@nestjs/common';
import { InMemoryRepository } from '../../common/repository/in-memory.repository';
import { CreateInput } from '../../common/repository/repository.interface';
import { ACTIVE_LEAVE_STATUSES } from './domain/leave-status';
import { overlaps } from './domain/leave-dates';
import { LeaveRequest } from './entities/leave-request.entity';

/**
 * Index employeeId → requests, so overlap checks only look at one person's leaves.
 * In SQL: index on (employee_id, from_date) and, in Postgres, an exclusion constraint
 * on daterange(from, to) for active statuses makes overlaps impossible even under races.
 */
@Injectable()
export class LeaveRequestRepository extends InMemoryRepository<LeaveRequest> {
  private readonly byEmployee = new Map<string, LeaveRequest[]>();

  constructor() {
    super('Leave request', 'lv');
  }

  override create(data: CreateInput<LeaveRequest>): LeaveRequest {
    const request = super.create(data);
    const list = this.byEmployee.get(request.employeeId) ?? [];
    list.push(request);
    this.byEmployee.set(request.employeeId, list);
    return request;
  }

  findByEmployee(employeeId: string): LeaveRequest[] {
    return [...(this.byEmployee.get(employeeId) ?? [])];
  }

  /** First PENDING/APPROVED request of this employee that shares a day with [from, to]. */
  findActiveOverlap(
    employeeId: string,
    from: string,
    to: string,
  ): LeaveRequest | undefined {
    return (this.byEmployee.get(employeeId) ?? []).find(
      (r) =>
        ACTIVE_LEAVE_STATUSES.includes(r.status) && overlaps(r, { from, to }),
    );
  }
}
