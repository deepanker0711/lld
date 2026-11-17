import { Module } from '@nestjs/common';
import { SPLIT_STRATEGIES, SPLIT_STRATEGY_CLASSES, type SplitStrategy } from './domain/split.strategy';
import { ExpenseRepository, GroupRepository, MemberRepository, SettlementRepository } from './repositories';
import { SplitwiseController } from './splitwise.controller';
import { SplitwiseService } from './splitwise.service';

@Module({
  controllers: [SplitwiseController],
  providers: [
    MemberRepository,
    GroupRepository,
    ExpenseRepository,
    SettlementRepository,
    ...SPLIT_STRATEGY_CLASSES,
    { provide: SPLIT_STRATEGIES, useFactory: (...s: SplitStrategy[]) => s, inject: SPLIT_STRATEGY_CLASSES },
    SplitwiseService,
  ],
})
export class SplitwiseModule {}
