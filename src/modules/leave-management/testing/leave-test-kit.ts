import { FakeClock } from '../../../common/utils/clock';
import { DEFAULT_LEAVE_OPTIONS } from '../domain/leave-options';
import {
  CasualLeavePolicy,
  EarnedLeavePolicy,
  SickLeavePolicy,
} from '../domain/leave-policy';
import { EmployeeRepository } from '../employee.repository';
import { EmployeesService } from '../employees.service';
import { LeaveBalanceRepository } from '../leave-balance.repository';
import { LeaveBalanceService } from '../leave-balance.service';
import { LeaveEventBus } from '../leave-event-bus';
import { LeavePolicyRegistry } from '../leave-policy-registry.service';
import { LeaveRequestRepository } from '../leave-request.repository';
import { LeavesService } from '../leaves.service';

/** Monday 2026-11-02, 10:00 in India (04:30 UTC). Holidays: 2026-11-09, 2026-12-25. */
export const NOW = Date.parse('2026-11-02T04:30:00.000Z');
export const DAY = 86_400_000;

/** Real services wired by hand, with a FakeClock. bus.publish is a spy-able method. */
export function createLeaveKit() {
  const clock = new FakeClock(NOW);
  const options = DEFAULT_LEAVE_OPTIONS;
  const employeeRepo = new EmployeeRepository();
  const balances = new LeaveBalanceService(
    new LeaveBalanceRepository(),
    options,
  );
  const employees = new EmployeesService(
    employeeRepo,
    balances,
    clock,
    options,
  );
  const bus = new LeaveEventBus();
  const leaveRepo = new LeaveRequestRepository();
  const leaves = new LeavesService(
    leaveRepo,
    employees,
    balances,
    new LeavePolicyRegistry([
      new CasualLeavePolicy(),
      new SickLeavePolicy(),
      new EarnedLeavePolicy(),
    ]),
    bus,
    clock,
    options,
  );

  /** A manager with two reports: the usual cast. */
  const team = () => {
    const mgr = employees.create({ name: 'Mgr', email: 'm@k.com' });
    const asha = employees.create({
      name: 'Asha',
      email: 'a@k.com',
      managerId: mgr.id,
    });
    const ravi = employees.create({
      name: 'Ravi',
      email: 'r@k.com',
      managerId: mgr.id,
    });
    return { mgr, asha, ravi };
  };

  return {
    clock,
    options,
    balances,
    employees,
    leaves,
    bus,
    employeeRepo,
    leaveRepo,
    team,
  };
}
