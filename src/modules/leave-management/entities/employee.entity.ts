import { BaseEntity } from '../../../common/entities/base.entity';

export class Employee extends BaseEntity {
  name: string;
  /** Stored lower-cased; unique. */
  email: string;
  /** null = top of the tree (nobody can approve their leave; see apply()). */
  managerId: string | null;
}
