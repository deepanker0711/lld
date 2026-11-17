import { FakeClock } from '../../../common/utils/clock';
import { EqualSplit, ExactSplit, PercentSplit, SharesSplit } from '../domain/split.strategy';
import { ExpenseRepository, GroupRepository, MemberRepository, SettlementRepository } from '../repositories';
import { SplitwiseService } from '../splitwise.service';

export function createSplitwiseKit() {
  const service = new SplitwiseService(
    new MemberRepository(),
    new GroupRepository(),
    new ExpenseRepository(),
    new SettlementRepository(),
    [new EqualSplit(), new ExactSplit(), new PercentSplit(), new SharesSplit()],
    new FakeClock(Date.parse('2026-11-09T04:30:00.000Z')),
  );
  const [a, b, c, d] = ['Asha', 'Ravi', 'Meera', 'Kabir'].map(
    (name) => service.createMember({ name, email: `${name.toLowerCase()}@example.com` }).id,
  );
  const group = service.createGroup({ name: 'Goa trip', memberIds: [a, b, c] });
  return { service, a, b, c, d, groupId: group.id };
}
