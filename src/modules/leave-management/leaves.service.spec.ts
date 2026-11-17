import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CommonModule } from '../../common/common.module';
import { LeaveStatus as S } from './domain/leave-status';
import { LeaveType as T } from './domain/leave-type';
import { ApplyLeaveDto } from './dto/apply-leave.dto';
import { LeaveManagementModule } from './leave-management.module';
import { LeavesService } from './leaves.service';
import { createLeaveKit, DAY } from './testing/leave-test-kit';

function errorOf(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    return e as { httpStatus: number; message: string; details?: unknown };
  }
  throw new Error('expected an error');
}

describe('Leave management', () => {
  let kit: ReturnType<typeof createLeaveKit>;
  let publish: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    kit = createLeaveKit();
    publish = vi.spyOn(kit.bus, 'publish').mockImplementation(() => undefined);
  });

  const apply = (employeeId: string, over: Partial<ApplyLeaveDto> = {}) =>
    kit.leaves.apply({
      employeeId,
      type: T.CASUAL,
      from: '2026-11-03',
      to: '2026-11-04',
      halfDay: false,
      reason: 'trip',
      ...over,
    });
  const balance = (employeeId: string, type: T) =>
    kit.employees.balancesOf(employeeId).find((b) => b.type === type)!;

  describe('T1 employees and balances', () => {
    it('seeds every leave type from the quotas for the current year', () => {
      const { asha } = kit.team();
      expect(asha.id).toMatch(/^emp_/);
      expect(kit.employees.balancesOf(asha.id)).toEqual([
        {
          type: 'CASUAL',
          year: 2026,
          allotted: 12,
          used: 0,
          pending: 0,
          available: 12,
        },
        {
          type: 'SICK',
          year: 2026,
          allotted: 10,
          used: 0,
          pending: 0,
          available: 10,
        },
        {
          type: 'EARNED',
          year: 2026,
          allotted: 15,
          used: 0,
          pending: 0,
          available: 15,
        },
      ]);
      // another year is created on first use
      expect(kit.employees.balancesOf(asha.id, 2027)[0]).toMatchObject({
        year: 2027,
        available: 12,
      });
    });

    it('409 on a duplicate email, 404 for an unknown manager', () => {
      kit.team();
      expect(
        errorOf(() => kit.employees.create({ name: 'X', email: 'a@k.com' })),
      ).toMatchObject({ httpStatus: 409 });
      expect(
        errorOf(() =>
          kit.employees.create({
            name: 'X',
            email: 'x@k.com',
            managerId: 'emp_nope',
          }),
        ),
      ).toMatchObject({
        httpStatus: 404,
      });
    });
  });

  describe('T3 apply', () => {
    it('creates a PENDING leave, counts working days, and reserves them', () => {
      const { asha } = kit.team();
      const leave = apply(asha.id);
      expect(leave).toMatchObject({
        id: expect.stringMatching(/^lv_/),
        status: S.PENDING,
        days: 2,
      });
      expect(leave.history).toEqual([
        expect.objectContaining({
          status: S.PENDING,
          by: asha.id,
          comment: 'trip',
        }),
      ]);
      expect(balance(asha.id, T.CASUAL)).toMatchObject({
        pending: 2,
        used: 0,
        available: 10,
      });
      expect(publish).toHaveBeenCalledWith(
        'leave.applied',
        expect.objectContaining({ leaveId: leave.id }),
      );
    });

    it('skips weekends and holidays; a half day is 0.5', () => {
      const { asha } = kit.team();
      expect(
        apply(asha.id, { from: '2026-11-06', to: '2026-11-10' }).days,
      ).toBe(2); // Fri, (Sat, Sun, Mon=holiday), Tue
      expect(
        apply(asha.id, { from: '2026-11-12', to: '2026-11-12', halfDay: true })
          .days,
      ).toBe(0.5);
    });

    it('400s for a bad range', () => {
      const { asha } = kit.team();
      const cases: [Partial<ApplyLeaveDto>, string][] = [
        [
          { from: '2026-11-04', to: '2026-11-03' },
          'to must be on or after from',
        ],
        [
          { type: T.SICK, from: '2026-12-31', to: '2027-01-01' },
          'A leave cannot span two calendar years; split it at Dec 31',
        ],
        [
          { halfDay: true },
          'halfDay is only allowed when from and to are the same day',
        ],
        [
          { from: '2026-11-07', to: '2026-11-08' },
          'The range has no working days (only weekends or holidays)',
        ],
      ];
      for (const [over, message] of cases) {
        expect(errorOf(() => apply(asha.id, over))).toMatchObject({
          httpStatus: 400,
          message,
        });
      }
    });

    it("422 when the leave type's policy says no", () => {
      const { asha } = kit.team();
      expect(
        errorOf(() =>
          apply(asha.id, {
            type: T.EARNED,
            from: '2026-11-05',
            to: '2026-11-05',
          }),
        ),
      ).toMatchObject({
        httpStatus: 422,
        message: 'EARNED leave needs 7 days notice',
        details: { type: 'EARNED' },
      });
      expect(
        errorOf(() => apply(asha.id, { from: '2026-11-03', to: '2026-11-06' })),
      ).toMatchObject({
        message: 'CASUAL leave is at most 3 working days per request',
      });
      // SICK may be backdated
      expect(
        apply(asha.id, { type: T.SICK, from: '2026-10-29', to: '2026-10-30' })
          .days,
      ).toBe(2);
    });

    it('409 when it overlaps a PENDING or APPROVED leave, even by one day', () => {
      const { asha, ravi } = kit.team();
      const first = apply(asha.id);
      expect(
        errorOf(() => apply(asha.id, { from: '2026-11-04', to: '2026-11-05' })),
      ).toMatchObject({
        httpStatus: 409,
        details: {
          leaveId: first.id,
          status: 'PENDING',
          from: '2026-11-03',
          to: '2026-11-04',
        },
      });
      // another employee on the same days is fine; a cancelled leave doesn't block
      expect(apply(ravi.id).status).toBe(S.PENDING);
      kit.leaves.cancel(first.id, asha.id);
      expect(
        apply(asha.id, { from: '2026-11-04', to: '2026-11-05' }).status,
      ).toBe(S.PENDING);
    });

    it('422 with available/requested when the balance (minus pending) is too low', () => {
      const { asha } = kit.team();
      apply(asha.id, { type: T.SICK, from: '2026-11-03', to: '2026-11-16' }); // 9 working days
      expect(
        errorOf(() =>
          apply(asha.id, {
            type: T.SICK,
            from: '2026-11-18',
            to: '2026-11-19',
          }),
        ),
      ).toMatchObject({
        httpStatus: 422,
        message: 'Insufficient SICK balance',
        details: { available: 1, requested: 2 },
      });
    });

    it('422 when the employee has no manager; 404 for an unknown employee', () => {
      const { mgr } = kit.team();
      expect(errorOf(() => apply(mgr.id))).toMatchObject({ httpStatus: 422 });
      expect(errorOf(() => apply('emp_nope'))).toMatchObject({
        httpStatus: 404,
      });
    });

    it('"today" is the company date: 01:30 IST on the 3rd means the 2nd is in the past', () => {
      const { asha } = kit.team();
      kit.clock.set(Date.parse('2026-11-02T20:00:00Z'));
      expect(
        errorOf(() => apply(asha.id, { from: '2026-11-02', to: '2026-11-02' })),
      ).toMatchObject({
        message: 'CASUAL leave cannot be backdated',
      });
    });
  });

  describe('T4 approve / reject', () => {
    it('only the manager decides; self and peers get 403; unknown approver 404', () => {
      const { asha, ravi } = kit.team();
      const leave = apply(asha.id);
      expect(
        errorOf(() => kit.leaves.approve(leave.id, asha.id)),
      ).toMatchObject({
        httpStatus: 403,
        message: 'You cannot approve or reject your own leave',
      });
      expect(
        errorOf(() => kit.leaves.approve(leave.id, ravi.id)),
      ).toMatchObject({ httpStatus: 403 });
      expect(
        errorOf(() => kit.leaves.approve(leave.id, 'emp_nope')),
      ).toMatchObject({ httpStatus: 404 });
      expect(kit.leaves.get(leave.id).status).toBe(S.PENDING);
    });

    it('approve moves pending → used; a second approve is 409', () => {
      const { mgr, asha } = kit.team();
      const leave = apply(asha.id);
      const approved = kit.leaves.approve(leave.id, mgr.id, 'enjoy');
      expect(approved).toMatchObject({
        status: S.APPROVED,
        approverId: mgr.id,
        comment: 'enjoy',
        decidedAt: expect.any(Date),
      });
      expect(approved.history.map((h) => h.status)).toEqual([
        S.PENDING,
        S.APPROVED,
      ]);
      expect(balance(asha.id, T.CASUAL)).toMatchObject({
        pending: 0,
        used: 2,
        available: 10,
      });
      expect(publish).toHaveBeenCalledWith(
        'leave.approved',
        expect.objectContaining({ by: mgr.id }),
      );

      expect(errorOf(() => kit.leaves.approve(leave.id, mgr.id))).toMatchObject(
        {
          httpStatus: 409,
          message: `Leave '${leave.id}' cannot move from APPROVED to APPROVED`,
          details: { allowed: ['CANCELLED'] },
        },
      );
      expect(balance(asha.id, T.CASUAL).used).toBe(2); // not counted twice
    });

    it('reject releases the reserved days', () => {
      const { mgr, asha } = kit.team();
      const leave = apply(asha.id);
      expect(kit.leaves.reject(leave.id, mgr.id, 'release week').status).toBe(
        S.REJECTED,
      );
      expect(balance(asha.id, T.CASUAL)).toMatchObject({
        pending: 0,
        used: 0,
        available: 12,
      });
      expect(errorOf(() => kit.leaves.approve(leave.id, mgr.id))).toMatchObject(
        { httpStatus: 409 },
      );
    });

    it('two approvals at once: one wins, the balance moves once', async () => {
      const { mgr, asha } = kit.team();
      const leave = apply(asha.id);
      const results = await Promise.allSettled([
        Promise.resolve().then(() => kit.leaves.approve(leave.id, mgr.id)),
        Promise.resolve().then(() => kit.leaves.approve(leave.id, mgr.id)),
      ]);
      expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
      expect(balance(asha.id, T.CASUAL)).toMatchObject({ used: 2, pending: 0 });
    });
  });

  describe('T5 cancel, lists, pending approvals', () => {
    it('cancel PENDING releases; cancel APPROVED before the start refunds', () => {
      const { mgr, asha } = kit.team();
      const pending = apply(asha.id);
      kit.leaves.cancel(pending.id, asha.id);
      expect(balance(asha.id, T.CASUAL)).toMatchObject({ pending: 0, used: 0 });

      const approved = kit.leaves.approve(apply(asha.id).id, mgr.id);
      expect(kit.leaves.cancel(approved.id, asha.id).status).toBe(S.CANCELLED);
      expect(balance(asha.id, T.CASUAL)).toMatchObject({
        pending: 0,
        used: 0,
        available: 12,
      });
    });

    it('409 once an approved leave has started; 403 for someone else; 409 for rejected', () => {
      const { mgr, asha, ravi } = kit.team();
      const leave = kit.leaves.approve(apply(asha.id).id, mgr.id); // starts 2026-11-03
      expect(errorOf(() => kit.leaves.cancel(leave.id, ravi.id))).toMatchObject(
        { httpStatus: 403 },
      );

      kit.clock.advance(DAY); // now the 3rd: started
      expect(errorOf(() => kit.leaves.cancel(leave.id, asha.id))).toMatchObject(
        {
          httpStatus: 409,
          message: 'Leave has already started and cannot be cancelled',
        },
      );

      const rejected = kit.leaves.reject(
        apply(asha.id, { from: '2026-11-11', to: '2026-11-11' }).id,
        mgr.id,
        'no',
      );
      expect(
        errorOf(() => kit.leaves.cancel(rejected.id, asha.id)),
      ).toMatchObject({ httpStatus: 409 });
    });

    it('pending approvals: direct reports only, soonest start first, with names', () => {
      const { mgr, asha, ravi } = kit.team();
      const other = kit.employees.create({ name: 'Boss', email: 'b@k.com' });
      const outsider = kit.employees.create({
        name: 'Out',
        email: 'o@k.com',
        managerId: other.id,
      });
      const later = apply(asha.id, { from: '2026-11-12', to: '2026-11-12' });
      const sooner = apply(ravi.id, { from: '2026-11-04', to: '2026-11-04' });
      const decided = apply(asha.id);
      kit.leaves.approve(decided.id, mgr.id);
      apply(outsider.id);

      expect(
        kit.leaves.pendingApprovals(mgr.id).map((l) => [l.id, l.employeeName]),
      ).toEqual([
        [sooner.id, 'Ravi'],
        [later.id, 'Asha'],
      ]);
      expect(
        errorOf(() => kit.leaves.pendingApprovals('emp_nope')),
      ).toMatchObject({ httpStatus: 404 });

      expect(kit.leaves.list({ employeeId: asha.id }).map((l) => l.id)).toEqual(
        [decided.id, later.id],
      );
      expect(kit.leaves.list({ status: S.APPROVED }).map((l) => l.id)).toEqual([
        decided.id,
      ]);
    });
  });
});

describe('LeaveManagementModule wiring', () => {
  it('builds LeavesService with every policy registered', async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({
      imports: [CommonModule, LeaveManagementModule],
    }).compile();
    expect(moduleRef.get(LeavesService)).toBeInstanceOf(LeavesService);
    vi.restoreAllMocks();
  });
});
