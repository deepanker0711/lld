import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EmployeeRepository } from './employee.repository';
import { LeaveEventBus, type LeaveEvents } from './leave-event-bus';
import { LeaveRequestRepository } from './leave-request.repository';

/**
 * Subscriber. Logs who would be told what. To send real messages, call the
 * notification service (topic 04) here; LeavesService doesn't change.
 */
@Injectable()
export class LeaveNotifier implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LeaveNotifier.name);
  private unsubscribers: (() => void)[] = [];

  constructor(
    private readonly bus: LeaveEventBus,
    private readonly employees: EmployeeRepository,
    private readonly leaves: LeaveRequestRepository,
  ) {}

  onModuleInit(): void {
    const handlers: { [E in keyof LeaveEvents]: (p: LeaveEvents[E]) => void } =
      {
        'leave.applied': (p) =>
          this.tell(
            p.managerId,
            p.leaveId,
            (name) => `${name} applied for leave`,
          ),
        'leave.approved': (p) =>
          this.tell(p.employeeId, p.leaveId, () => 'your leave was approved'),
        'leave.rejected': (p) =>
          this.tell(p.employeeId, p.leaveId, () => 'your leave was rejected'),
        'leave.cancelled': (p) =>
          this.tell(
            p.managerId,
            p.leaveId,
            (name) => `${name} cancelled their leave`,
          ),
      };
    for (const event of Object.keys(handlers) as (keyof LeaveEvents)[]) {
      this.unsubscribers.push(
        this.bus.subscribe(event, handlers[event] as never),
      );
    }
  }

  onModuleDestroy(): void {
    this.unsubscribers.forEach((u) => u());
  }

  private tell(
    recipientId: string | null,
    leaveId: string,
    what: (employeeName: string) => string,
  ): void {
    const leave = this.leaves.findById(leaveId);
    const recipient = recipientId
      ? this.employees.findById(recipientId)
      : undefined;
    const subject = leave
      ? this.employees.findById(leave.employeeId)
      : undefined;
    if (!leave || !recipient || !subject) return;
    this.logger.log(
      `→ ${recipient.email}: ${what(subject.name)} (${leave.type} ${leave.from}..${leave.to}, ${leave.days} day(s))`,
    );
  }
}
