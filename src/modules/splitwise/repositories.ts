import { Injectable } from '@nestjs/common';
import { InMemoryRepository } from '../../common/repository/in-memory.repository';
import { CreateInput } from '../../common/repository/repository.interface';
import { Expense, Group, Member, Settlement } from './entities/entities';

const push = (m: Map<string, string[]>, k: string, id: string) => m.set(k, [...(m.get(k) ?? []), id]);

@Injectable()
export class MemberRepository extends InMemoryRepository<Member> {
  private readonly byEmail = new Map<string, string>();
  constructor() {
    super('Member', 'mem');
  }
  override create(data: CreateInput<Member>): Member {
    const m = super.create(data);
    this.byEmail.set(m.email, m.id);
    return m;
  }
  findByEmail(email: string): Member | undefined {
    const id = this.byEmail.get(email);
    return id ? this.findById(id) : undefined;
  }
}

@Injectable()
export class GroupRepository extends InMemoryRepository<Group> {
  constructor() {
    super('Group', 'grp');
  }
  findByMember(memberId: string): Group[] {
    return this.findAll((g) => g.memberIds.includes(memberId));
  }
}

/** groupId → expenses / settlements, so a group's balance never scans other groups. */
@Injectable()
export class ExpenseRepository extends InMemoryRepository<Expense> {
  private readonly byGroup = new Map<string, string[]>();
  constructor() {
    super('Expense', 'exp');
  }
  override create(data: CreateInput<Expense>): Expense {
    const e = super.create(data);
    push(this.byGroup, e.groupId, e.id);
    return e;
  }
  findByGroup(groupId: string): Expense[] {
    return (this.byGroup.get(groupId) ?? []).map((id) => this.findByIdOrThrow(id));
  }
}

@Injectable()
export class SettlementRepository extends InMemoryRepository<Settlement> {
  private readonly byGroup = new Map<string, string[]>();
  constructor() {
    super('Settlement', 'stl');
  }
  override create(data: CreateInput<Settlement>): Settlement {
    const s = super.create(data);
    push(this.byGroup, s.groupId, s.id);
    return s;
  }
  findByGroup(groupId: string): Settlement[] {
    return (this.byGroup.get(groupId) ?? []).map((id) => this.findByIdOrThrow(id));
  }
}
