import { BaseEntity } from '../../../common/entities/base.entity';

export class Job extends BaseEntity {
  type: string;
  payload: Record<string, unknown>;
  status: string;
  runAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  lastError: string | null;
}
