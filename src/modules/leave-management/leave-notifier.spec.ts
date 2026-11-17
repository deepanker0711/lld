import { Logger } from '@nestjs/common';
import { LeaveType } from './domain/leave-type';
import { LeaveNotifier } from './leave-notifier.listener';
import { createLeaveKit } from './testing/leave-test-kit';

describe('LeaveNotifier (Observer)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('tells the manager on apply and the employee on approval, after the call returns', async () => {
    const log = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const kit = createLeaveKit();
    const notifier = new LeaveNotifier(
      kit.bus,
      kit.employeeRepo,
      kit.leaveRepo,
    );
    notifier.onModuleInit();

    const { mgr, asha } = kit.team();
    const leave = kit.leaves.apply({
      employeeId: asha.id,
      type: LeaveType.CASUAL,
      from: '2026-11-03',
      to: '2026-11-04',
      halfDay: false,
      reason: 'trip',
    });
    kit.leaves.approve(leave.id, mgr.id);
    expect(log).not.toHaveBeenCalled(); // published with setImmediate: not inside the service call

    await new Promise((r) => setImmediate(r));
    expect(log.mock.calls.map((c) => c[0])).toEqual([
      '→ m@k.com: Asha applied for leave (CASUAL 2026-11-03..2026-11-04, 2 day(s))',
      '→ a@k.com: your leave was approved (CASUAL 2026-11-03..2026-11-04, 2 day(s))',
    ]);
    notifier.onModuleDestroy();
  });
});
