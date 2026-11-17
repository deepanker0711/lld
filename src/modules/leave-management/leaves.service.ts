import { Inject, Injectable } from '@nestjs/common';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  UnprocessableError,
} from '../../common/errors/domain.errors';
import { Clock } from '../../common/utils/clock';
import { todayIn, workingDaysBetween } from './domain/leave-dates';
import { LEAVE_OPTIONS, type LeaveOptions } from './domain/leave-options';
import { assertLeaveTransition, LeaveStatus } from './domain/leave-status';
import { ApplyLeaveDto } from './dto/apply-leave.dto';
import { ListLeavesQuery } from './dto/leave-queries';
import { availableOf } from './entities/leave-balance.entity';
import { LeaveRequest } from './entities/leave-request.entity';
import { EmployeesService } from './employees.service';
import { LeaveBalanceService } from './leave-balance.service';
import { LeaveEventBus } from './leave-event-bus';
import { LeavePolicyRegistry } from './leave-policy-registry.service';
import { LeaveRequestRepository } from './leave-request.repository';

export type PendingApproval = LeaveRequest & { employeeName: string };

/**
 * Every method here is synchronous: the status change and the balance move happen in one
 * uninterrupted block, so two concurrent approve calls can't both succeed (the second sees
 * APPROVED and gets 409). With a database, the same block is one transaction with a
 * conditional UPDATE ... WHERE status = 'PENDING'.
 */
@Injectable()
export class LeavesService {
  private readonly holidays: ReadonlySet<string>;

  constructor(
    private readonly leaves: LeaveRequestRepository,
    private readonly employees: EmployeesService,
    private readonly balances: LeaveBalanceService,
    private readonly policies: LeavePolicyRegistry,
    private readonly bus: LeaveEventBus,
    private readonly clock: Clock,
    @Inject(LEAVE_OPTIONS) private readonly options: LeaveOptions,
  ) {
    this.holidays = new Set(options.holidays);
  }

  // ── Apply ────────────────────────────────────────────────────────────

  apply(dto: ApplyLeaveDto): LeaveRequest {
    const employee = this.employees.get(dto.employeeId); // 404
    if (!employee.managerId) {
      throw new UnprocessableError(
        `Employee '${employee.id}' has no manager to approve leave`,
      );
    }

    // 1. Shape of the range (400): things wrong with the request itself.
    if (dto.to < dto.from)
      throw new BadRequestError('to must be on or after from');
    if (dto.from.slice(0, 4) !== dto.to.slice(0, 4)) {
      throw new BadRequestError(
        'A leave cannot span two calendar years; split it at Dec 31',
      );
    }
    if (dto.halfDay && dto.from !== dto.to) {
      throw new BadRequestError(
        'halfDay is only allowed when from and to are the same day',
      );
    }
    const working = workingDaysBetween(dto.from, dto.to, this.holidays);
    if (working === 0) {
      throw new BadRequestError(
        'The range has no working days (only weekends or holidays)',
        {
          from: dto.from,
          to: dto.to,
        },
      );
    }
    const days = dto.halfDay ? 0.5 : working;

    // 2. Per-type rule (422): valid request, but this leave type doesn't allow it.
    const violation = this.policies
      .get(dto.type)
      .violation(
        { from: dto.from, to: dto.to, days, halfDay: dto.halfDay },
        this.today(),
      );
    if (violation) throw new UnprocessableError(violation, { type: dto.type });

    // 3. Clash with an existing PENDING/APPROVED leave (409).
    const clash = this.leaves.findActiveOverlap(employee.id, dto.from, dto.to);
    if (clash) {
      throw new ConflictError(
        `Overlaps leave '${clash.id}' (${clash.status}, ${clash.from} to ${clash.to})`,
        {
          leaveId: clash.id,
          status: clash.status,
          from: clash.from,
          to: clash.to,
        },
      );
    }

    // 4. Balance (422), counting days already reserved by PENDING requests.
    const balance = this.balances.get(
      employee.id,
      dto.type,
      Number(dto.from.slice(0, 4)),
    );
    const available = availableOf(balance);
    if (days > available) {
      throw new UnprocessableError(`Insufficient ${dto.type} balance`, {
        available,
        requested: days,
      });
    }

    // All checks passed: create and reserve together.
    const leave = this.leaves.create({
      employeeId: employee.id,
      type: dto.type,
      from: dto.from,
      to: dto.to,
      halfDay: dto.halfDay,
      days,
      reason: dto.reason,
      status: LeaveStatus.PENDING,
      approverId: null,
      decidedAt: null,
      comment: null,
      history: [
        {
          status: LeaveStatus.PENDING,
          at: this.clock.date(),
          by: employee.id,
          comment: dto.reason,
        },
      ],
    });
    this.balances.reserve(balance, days);
    this.publish('leave.applied', leave, employee.id);
    return leave;
  }

  // ── Decide ───────────────────────────────────────────────────────────

  approve(id: string, approverId: string, comment?: string): LeaveRequest {
    return this.decide(id, approverId, LeaveStatus.APPROVED, comment ?? null);
  }

  reject(id: string, approverId: string, comment: string): LeaveRequest {
    return this.decide(id, approverId, LeaveStatus.REJECTED, comment);
  }

  private decide(
    id: string,
    approverId: string,
    to: LeaveStatus.APPROVED | LeaveStatus.REJECTED,
    comment: string | null,
  ): LeaveRequest {
    const leave = this.get(id);
    this.employees.get(approverId); // 404 for an unknown approver
    const employee = this.employees.get(leave.employeeId);

    // Authorization before state: someone who may not decide learns nothing about the state.
    if (approverId === leave.employeeId) {
      throw new ForbiddenError('You cannot approve or reject your own leave');
    }
    if (employee.managerId !== approverId) {
      throw new ForbiddenError(
        "Only the employee's manager can approve or reject this leave",
        {
          managerId: employee.managerId,
        },
      );
    }
    assertLeaveTransition(leave.status, to, leave.id); // 409 if already decided/cancelled

    const balance = this.balances.get(
      leave.employeeId,
      leave.type,
      this.yearOf(leave),
    );
    if (to === LeaveStatus.APPROVED) this.balances.confirm(balance, leave.days);
    else this.balances.release(balance, leave.days);

    const decided = this.transition(leave, to, approverId, comment, {
      approverId,
      decidedAt: this.clock.date(),
      comment,
    });
    this.publish(
      to === LeaveStatus.APPROVED ? 'leave.approved' : 'leave.rejected',
      decided,
      approverId,
    );
    return decided;
  }

  // ── Cancel ───────────────────────────────────────────────────────────

  cancel(id: string, employeeId: string): LeaveRequest {
    const leave = this.get(id);
    if (employeeId !== leave.employeeId) {
      throw new ForbiddenError(
        'Only the employee who applied can cancel this leave',
      );
    }
    assertLeaveTransition(leave.status, LeaveStatus.CANCELLED, leave.id); // REJECTED/CANCELLED → 409
    // Guard the table can't express: an approved leave can be cancelled only before it starts.
    if (leave.status === LeaveStatus.APPROVED && leave.from <= this.today()) {
      throw new ConflictError(
        'Leave has already started and cannot be cancelled',
        {
          from: leave.from,
          today: this.today(),
        },
      );
    }

    const balance = this.balances.get(
      leave.employeeId,
      leave.type,
      this.yearOf(leave),
    );
    if (leave.status === LeaveStatus.PENDING)
      this.balances.release(balance, leave.days);
    else this.balances.refund(balance, leave.days);

    const cancelled = this.transition(
      leave,
      LeaveStatus.CANCELLED,
      employeeId,
      null,
    );
    this.publish('leave.cancelled', cancelled, employeeId);
    return cancelled;
  }

  // ── Reads ────────────────────────────────────────────────────────────

  get(id: string): LeaveRequest {
    return this.leaves.findByIdOrThrow(id);
  }

  /** Newest first. */
  list(query: ListLeavesQuery): LeaveRequest[] {
    const base = query.employeeId
      ? this.leaves.findByEmployee(query.employeeId)
      : this.leaves.findAll();
    return base
      .filter((l) => !query.status || l.status === query.status)
      .reverse();
  }

  /** PENDING leaves of the manager's direct reports, soonest start first (most urgent). */
  pendingApprovals(managerId: string): PendingApproval[] {
    this.employees.get(managerId); // 404
    return this.employees
      .directReports(managerId)
      .flatMap((e) =>
        this.leaves
          .findByEmployee(e.id)
          .filter((l) => l.status === LeaveStatus.PENDING)
          .map((l) => ({ ...l, employeeName: e.name })),
      )
      .sort(
        (a, b) =>
          a.from.localeCompare(b.from) ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      );
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private transition(
    leave: LeaveRequest,
    to: LeaveStatus,
    by: string,
    comment: string | null,
    patch: Partial<
      Pick<LeaveRequest, 'approverId' | 'decidedAt' | 'comment'>
    > = {},
  ): LeaveRequest {
    return this.leaves.update(leave.id, {
      ...patch,
      status: to,
      history: [
        ...leave.history,
        { status: to, at: this.clock.date(), by, comment },
      ],
    });
  }

  private publish(
    event:
      'leave.applied' | 'leave.approved' | 'leave.rejected' | 'leave.cancelled',
    leave: LeaveRequest,
    by: string,
  ): void {
    const employee = this.employees.get(leave.employeeId);
    this.bus.publish(event, {
      leaveId: leave.id,
      employeeId: leave.employeeId,
      managerId: employee.managerId,
      by,
    });
  }

  private yearOf(leave: LeaveRequest): number {
    return Number(leave.from.slice(0, 4));
  }

  private today(): string {
    return todayIn(this.options.timeZone, this.clock.date());
  }
}
