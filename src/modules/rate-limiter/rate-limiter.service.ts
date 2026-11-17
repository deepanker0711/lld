import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConflictError } from '../../common/errors/domain.errors';
import { InMemoryRepository } from '../../common/repository/in-memory.repository';
import { Clock } from '../../common/utils/clock';
import { RateLimitAlgorithm, RateLimitAlgorithmType, RateLimitDecision } from './domain/rate-limit-algorithm';
import { createRateLimitAlgorithm } from './domain/rate-limit-algorithm.factory';
import { CreateRuleDto, UpdateRuleDto } from './dto/rate-limit-rule.dto';
import { RateLimitRule } from './entities/rate-limit-rule.entity';

/** Seeded so the demo routes work right after start. Change them with PATCH. */
const DEFAULT_RULES: CreateRuleDto[] = [
  { key: 'default', algorithm: RateLimitAlgorithmType.TOKEN_BUCKET, limit: 5, windowMs: 10_000 },
  { key: 'search', algorithm: RateLimitAlgorithmType.SLIDING_WINDOW_LOG, limit: 3, windowMs: 10_000 },
];

const PRUNE_EVERY_MS = 60_000;

@Injectable()
export class RateLimiterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RateLimiterService.name);
  private readonly rules = new InMemoryRepository<RateLimitRule>('Rate limit rule');
  /** One algorithm instance (with all its per-client state) per rule key. */
  private readonly limiters = new Map<string, RateLimitAlgorithm>();
  private pruneTimer?: NodeJS.Timeout;

  constructor(private readonly clock: Clock) {
    DEFAULT_RULES.forEach((rule) => this.createRule(rule));
  }

  onModuleInit() {
    // Without this, every client ever seen stays in memory forever.
    this.pruneTimer = setInterval(() => this.prune(), PRUNE_EVERY_MS);
    this.pruneTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.pruneTimer);
  }

  /**
   * Used by the guard. Unknown rule → null (caller fails open): a typo in a
   * decorator should not take an endpoint down. Say this trade-off out loud.
   */
  check(ruleKey: string, clientId: string): RateLimitDecision | null {
    const limiter = this.limiters.get(ruleKey);
    return limiter ? limiter.tryConsume(clientId, this.clock.now()) : null;
  }

  usage(ruleKey: string, clientId: string) {
    this.rules.findByIdOrThrow(ruleKey);
    const decision = this.limiters.get(ruleKey)!.peek(clientId, this.clock.now());
    return { rule: ruleKey, clientId, ...decision };
  }

  listRules() {
    return this.rules.findAll().map((rule) => this.toView(rule));
  }

  getRule(key: string) {
    return this.toView(this.rules.findByIdOrThrow(key));
  }

  createRule(dto: CreateRuleDto) {
    if (this.rules.exists(dto.key)) throw new ConflictError(`Rule '${dto.key}' already exists`);
    const rule = this.rules.create({ id: dto.key, ...dto });
    this.limiters.set(rule.key, createRateLimitAlgorithm(rule.algorithm, rule));
    return this.toView(rule);
  }

  /**
   * Replaces the algorithm instance, so every client starts fresh. Converting state
   * between algorithms (token count ↔ timestamp log) isn't meaningful, and a reset
   * after a config change is the simple, predictable behaviour.
   */
  updateRule(key: string, dto: UpdateRuleDto) {
    const rule = this.rules.update(key, dto);
    this.limiters.set(key, createRateLimitAlgorithm(rule.algorithm, rule));
    return this.toView(rule);
  }

  deleteRule(key: string) {
    this.rules.findByIdOrThrow(key);
    this.rules.delete(key);
    this.limiters.delete(key);
    return { deleted: key };
  }

  prune(): number {
    const now = this.clock.now();
    let removed = 0;
    for (const limiter of this.limiters.values()) removed += limiter.prune(now);
    if (removed) this.logger.debug(`pruned ${removed} idle clients`);
    return removed;
  }

  private toView(rule: RateLimitRule) {
    return {
      key: rule.key,
      algorithm: rule.algorithm,
      limit: rule.limit,
      windowMs: rule.windowMs,
      trackedClients: this.limiters.get(rule.key)?.trackedClients() ?? 0,
      updatedAt: rule.updatedAt.toISOString(),
    };
  }
}
