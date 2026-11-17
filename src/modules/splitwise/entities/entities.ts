import { BaseEntity } from '../../../common/entities/base.entity';
import { Share, SplitType } from '../domain/split.strategy';

export class Member extends BaseEntity {
  name: string;
  email: string;
}

export class Group extends BaseEntity {
  name: string;
  memberIds: string[];
}

export class Expense extends BaseEntity {
  groupId: string;
  description: string;
  paidBy: string;
  amountPaise: number;
  splitType: SplitType;
  /** Computed once, stored: the record of who owed what, even if rules change later. */
  shares: Share[];
  createdBy: string;
  deletedAt: Date | null;
}

/** A real-world payment "Ravi paid Asha ₹500", recorded to clear a debt. */
export class Settlement extends BaseEntity {
  groupId: string;
  from: string;
  to: string;
  amountPaise: number;
}
