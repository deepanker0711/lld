import { Inject, Injectable } from '@nestjs/common';
import { LEAVE_POLICIES, type LeavePolicy } from './domain/leave-policy';
import { ALL_LEAVE_TYPES, LeaveType } from './domain/leave-type';

/**
 * Registry: type → policy (same shape as ChannelFactory). The DTO already limits types
 * to the enum, so a missing policy is our bug: caught at boot, not per request.
 */
@Injectable()
export class LeavePolicyRegistry {
  private readonly policies = new Map<LeaveType, LeavePolicy>();

  constructor(@Inject(LEAVE_POLICIES) policies: LeavePolicy[]) {
    for (const p of policies) {
      if (this.policies.has(p.type)) {
        throw new Error(`Duplicate leave policy for '${p.type}'`);
      }
      this.policies.set(p.type, p);
    }
    const missing = ALL_LEAVE_TYPES.filter((t) => !this.policies.has(t));
    if (missing.length > 0) {
      throw new Error(`No leave policy for: ${missing.join(', ')}`);
    }
  }

  get(type: LeaveType): LeavePolicy {
    return this.policies.get(type)!;
  }
}
