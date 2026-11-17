import { Injectable } from '@nestjs/common';
import { TypedEventBus } from '../../common/events/typed-event-bus';

export interface LeaveEventPayload {
  leaveId: string;
  employeeId: string;
  managerId: string | null;
  /** Who caused it: the employee (applied, cancelled) or the manager (approved, rejected). */
  by: string;
}

export interface LeaveEvents {
  'leave.applied': LeaveEventPayload;
  'leave.approved': LeaveEventPayload;
  'leave.rejected': LeaveEventPayload;
  'leave.cancelled': LeaveEventPayload;
}

/** Observer: LeavesService publishes; notifier/payroll/calendar sync subscribe without it knowing. */
@Injectable()
export class LeaveEventBus extends TypedEventBus<LeaveEvents> {}
