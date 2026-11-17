import { BaseEntity } from '../../../common/entities/base.entity';
import { RateLimitAlgorithmType } from '../domain/rate-limit-algorithm';

/** id === key ('default', 'search', ...). Routes refer to rules by key via @RateLimit(key). */
export class RateLimitRule extends BaseEntity {
  key: string;
  algorithm: RateLimitAlgorithmType;
  limit: number;
  windowMs: number;
}
