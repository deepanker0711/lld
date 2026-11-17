import { Inject, Injectable } from '@nestjs/common';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnprocessableError,
} from '../../common/errors/domain.errors';
import { Clock } from '../../common/utils/clock';
import { type Debt, simplifyDebts } from './domain/simplify';
import { SPLIT_STRATEGIES, type SplitStrategy, SplitType } from './domain/split.strategy';
import { AddExpenseDto, CreateGroupDto, CreateMemberDto, SettleDto } from './dto/dto';
import { Expense, Group, Member, Settlement } from './entities/entities';
import { ExpenseRepository, GroupRepository, MemberRepository, SettlementRepository } from './repositories';

export interface GroupBalances {
  groupId: string;
  /** + is owed money, − owes money. Always sums to 0. */
  net: { memberId: string; name: string; netPaise: number }[];
  /** Raw "who owes whom", netted per pair. */
  pairwise: Debt[];
  /** Fewest payments to settle everything (greedy, ≤ n − 1). */
  simplified: Debt[];
}

@Injectable()
export class SplitwiseService {
  private readonly strategies = new Map<SplitType, SplitStrategy>();

  constructor(
    private readonly members: MemberRepository,
    private readonly groups: GroupRepository,
    private readonly expenses: ExpenseRepository,
    private readonly settlements: SettlementRepository,
    @Inject(SPLIT_STRATEGIES) strategies: SplitStrategy[],
    private readonly clock: Clock,
  ) {
    for (const s of strategies) this.strategies.set(s.type, s);
    const missing = Object.values(SplitType).filter((t) => !this.strategies.has(t));
    if (missing.length) throw new Error(`No split strategy for: ${missing.join(', ')}`);
  }

  // ── Members & groups ─────────────────────────────────────────────────

  createMember(dto: CreateMemberDto): Member {
    if (this.members.findByEmail(dto.email)) throw new ConflictError(`Member with email '${dto.email}' already exists`);
    return this.members.create({ name: dto.name, email: dto.email });
  }

  listMembers(): Member[] {
    return this.members.findAll();
  }

  createGroup(dto: CreateGroupDto): Group {
    const ids = [...new Set(dto.memberIds)];
    ids.forEach((id) => this.member(id));
    if (ids.length < 2) throw new BadRequestError('A group needs at least 2 different members');
    return this.groups.create({ name: dto.name, memberIds: ids });
  }

  getGroup(id: string): Group & { members: Member[] } {
    const g = this.groups.findByIdOrThrow(id);
    return { ...g, members: g.memberIds.map((m) => this.member(m)) };
  }

  addMember(groupId: string, memberId: string): Group {
    const g = this.groups.findByIdOrThrow(groupId);
    this.member(memberId);
    if (g.memberIds.includes(memberId)) throw new ConflictError('Already a member of this group');
    return this.groups.update(groupId, { memberIds: [...g.memberIds, memberId] });
  }

  /** Leaving with an open balance would make the debt disappear. */
  removeMember(groupId: string, memberId: string): Group {
    const g = this.groups.findByIdOrThrow(groupId);
    if (!g.memberIds.includes(memberId)) throw new NotFoundError('Group member', memberId);
    const net = this.netBalances(g).get(memberId) ?? 0;
    if (net !== 0) throw new UnprocessableError('Settle up before leaving the group', { netPaise: net });
    return this.groups.update(groupId, { memberIds: g.memberIds.filter((m) => m !== memberId) });
  }

  // ── Expenses ─────────────────────────────────────────────────────────

  addExpense(groupId: string, dto: AddExpenseDto): Expense {
    const g = this.groups.findByIdOrThrow(groupId);
    const notInGroup = [dto.paidBy, ...dto.splits.map((s) => s.memberId)].filter((m) => !g.memberIds.includes(m));
    if (notInGroup.length) {
      throw new UnprocessableError(`Not members of this group: ${[...new Set(notInGroup)].join(', ')}`);
    }
    const ids = dto.splits.map((s) => s.memberId);
    if (new Set(ids).size !== ids.length) throw new BadRequestError('A member appears twice in splits');

    const shares = this.strategies.get(dto.splitType)!.split(dto.amountPaise, dto.splits);
    return this.expenses.create({
      groupId,
      description: dto.description,
      paidBy: dto.paidBy,
      amountPaise: dto.amountPaise,
      splitType: dto.splitType,
      shares,
      createdBy: dto.paidBy,
      deletedAt: null,
    });
  }

  listExpenses(groupId: string): Expense[] {
    this.groups.findByIdOrThrow(groupId);
    return this.expenses.findByGroup(groupId).filter((e) => !e.deletedAt).reverse();
  }

  /** Soft delete: balances are derived, so they update by themselves; history stays. */
  deleteExpense(groupId: string, expenseId: string): Expense {
    const e = this.expenses.findById(expenseId);
    if (!e || e.groupId !== groupId || e.deletedAt) throw new NotFoundError('Expense', expenseId);
    return this.expenses.update(expenseId, { deletedAt: this.clock.date() });
  }

  // ── Balances & settling ──────────────────────────────────────────────

  balances(groupId: string): GroupBalances {
    const g = this.groups.findByIdOrThrow(groupId);
    const net = this.netBalances(g);
    return {
      groupId,
      net: [...net].map(([memberId, netPaise]) => ({ memberId, name: this.member(memberId).name, netPaise })),
      pairwise: this.pairwise(g),
      simplified: simplifyDebts(net),
    };
  }

  /** Can't pay more than you owe, or more than they're owed: that would create a new debt. */
  settle(groupId: string, dto: SettleDto): Settlement {
    const g = this.groups.findByIdOrThrow(groupId);
    if (dto.from === dto.to) throw new BadRequestError('from and to must be different members');
    for (const m of [dto.from, dto.to]) {
      if (!g.memberIds.includes(m)) throw new UnprocessableError(`'${m}' is not a member of this group`);
    }
    const net = this.netBalances(g);
    const owes = -(net.get(dto.from) ?? 0);
    const owed = net.get(dto.to) ?? 0;
    const max = Math.max(0, Math.min(owes, owed));
    if (dto.amountPaise > max) {
      throw new UnprocessableError(`At most ₹${max / 100} can be settled from ${dto.from} to ${dto.to}`, {
        maxPaise: max,
        fromOwesPaise: Math.max(0, owes),
        toIsOwedPaise: Math.max(0, owed),
      });
    }
    return this.settlements.create({ groupId, from: dto.from, to: dto.to, amountPaise: dto.amountPaise });
  }

  /** One member across all their groups. */
  memberSummary(memberId: string): { memberId: string; totalNetPaise: number; groups: { groupId: string; name: string; netPaise: number }[] } {
    this.member(memberId);
    const groups = this.groups.findByMember(memberId).map((g) => ({
      groupId: g.id,
      name: g.name,
      netPaise: this.netBalances(g).get(memberId) ?? 0,
    }));
    return { memberId, totalNetPaise: groups.reduce((s, g) => s + g.netPaise, 0), groups };
  }

  // ── Derivation ───────────────────────────────────────────────────────

  /**
   * Recomputed from expenses + settlements on every read: nothing to keep in sync, and
   * deleting an expense "just works". O(expenses) per call; cache it if groups get huge.
   */
  private netBalances(g: Group): Map<string, number> {
    const net = new Map<string, number>(g.memberIds.map((m) => [m, 0]));
    const add = (m: string, v: number) => net.set(m, (net.get(m) ?? 0) + v);
    for (const e of this.expenses.findByGroup(g.id)) {
      if (e.deletedAt) continue;
      add(e.paidBy, e.amountPaise);
      e.shares.forEach((s) => add(s.memberId, -s.owedPaise));
    }
    for (const s of this.settlements.findByGroup(g.id)) {
      add(s.from, s.amountPaise); // paying back reduces what you owe
      add(s.to, -s.amountPaise);
    }
    return net;
  }

  private pairwise(g: Group): Debt[] {
    const owe = new Map<string, number>(); // "a→b" = a owes b
    const add = (a: string, b: string, v: number) => {
      if (a === b || v === 0) return;
      const [x, y, sign] = a < b ? [a, b, 1] : [b, a, -1];
      owe.set(`${x}→${y}`, (owe.get(`${x}→${y}`) ?? 0) + sign * v);
    };
    for (const e of this.expenses.findByGroup(g.id)) {
      if (!e.deletedAt) e.shares.forEach((s) => add(s.memberId, e.paidBy, s.owedPaise));
    }
    for (const s of this.settlements.findByGroup(g.id)) add(s.to, s.from, s.amountPaise);
    return [...owe]
      .filter(([, v]) => v !== 0)
      .map(([k, v]) => {
        const [x, y] = k.split('→');
        return v > 0 ? { from: x, to: y, amountPaise: v } : { from: y, to: x, amountPaise: -v };
      });
  }

  private member(id: string): Member {
    const m = this.members.findById(id);
    if (!m) throw new NotFoundError('Member', id);
    return m;
  }
}
