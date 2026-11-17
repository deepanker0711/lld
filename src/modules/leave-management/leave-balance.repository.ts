import { Injectable } from '@nestjs/common';
import { InMemoryRepository } from '../../common/repository/in-memory.repository';
import { LeaveType } from './domain/leave-type';
import { balanceId, LeaveBalance } from './entities/leave-balance.entity';

@Injectable()
export class LeaveBalanceRepository extends InMemoryRepository<LeaveBalance> {
  constructor() {
    super('Leave balance');
  }

  find(
    employeeId: string,
    type: LeaveType,
    year: number,
  ): LeaveBalance | undefined {
    return this.findById(balanceId(employeeId, type, year));
  }
}
