import { Module } from '@nestjs/common';
import { DEFAULT_LEAVE_OPTIONS, LEAVE_OPTIONS } from './domain/leave-options';
import {
  LEAVE_POLICIES,
  LEAVE_POLICY_CLASSES,
  type LeavePolicy,
} from './domain/leave-policy';
import { EmployeeRepository } from './employee.repository';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { LeaveBalanceRepository } from './leave-balance.repository';
import { LeaveBalanceService } from './leave-balance.service';
import { LeaveEventBus } from './leave-event-bus';
import { LeaveNotifier } from './leave-notifier.listener';
import { LeavePolicyRegistry } from './leave-policy-registry.service';
import { LeaveRequestRepository } from './leave-request.repository';
import { LeavesController } from './leaves.controller';
import { LeavesService } from './leaves.service';

@Module({
  controllers: [EmployeesController, LeavesController],
  providers: [
    EmployeeRepository,
    LeaveBalanceRepository,
    LeaveRequestRepository,
    { provide: LEAVE_OPTIONS, useValue: DEFAULT_LEAVE_OPTIONS },
    ...LEAVE_POLICY_CLASSES,
    // Collect every policy instance into one array (same trick as job handlers / channel senders).
    {
      provide: LEAVE_POLICIES,
      useFactory: (...policies: LeavePolicy[]) => policies,
      inject: LEAVE_POLICY_CLASSES,
    },
    LeavePolicyRegistry,
    LeaveBalanceService,
    LeaveEventBus,
    LeaveNotifier,
    EmployeesService,
    LeavesService,
  ],
})
export class LeaveManagementModule {}
