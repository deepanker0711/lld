import { RateLimitAlgorithm, RateLimitAlgorithmType, RateLimitConfig } from './rate-limit-algorithm';
import { SlidingWindowLog } from './sliding-window-log';
import { TokenBucket } from './token-bucket';

/** Factory: rule config in, algorithm instance out. Add FIXED_WINDOW etc. here. */
export function createRateLimitAlgorithm(type: RateLimitAlgorithmType, config: RateLimitConfig): RateLimitAlgorithm {
  switch (type) {
    case RateLimitAlgorithmType.TOKEN_BUCKET:
      return new TokenBucket(config);
    case RateLimitAlgorithmType.SLIDING_WINDOW_LOG:
      return new SlidingWindowLog(config);
  }
}
