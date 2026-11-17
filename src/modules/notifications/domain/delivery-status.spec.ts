import {
  aggregateStatus,
  assertDeliveryTransition,
  DeliveryStatus as S,
} from './delivery-status';

describe('delivery status', () => {
  it('allows the dispatcher paths and rejects leaving a terminal state', () => {
    expect(() =>
      assertDeliveryTransition(S.PENDING, S.SENDING, 'd1'),
    ).not.toThrow();
    expect(() =>
      assertDeliveryTransition(S.SENDING, S.PENDING, 'd1'),
    ).not.toThrow();
    expect(() => assertDeliveryTransition(S.PENDING, S.SENT, 'd1')).toThrow(
      "Delivery 'd1' cannot move from PENDING to SENT",
    );
    expect(() => assertDeliveryTransition(S.SENT, S.PENDING, 'd1')).toThrow();
  });

  it.each([
    [[S.SENT, S.PENDING], 'IN_PROGRESS'],
    [[S.SENT, S.SENDING], 'IN_PROGRESS'],
    [[S.SENT, S.SENT], 'SENT'],
    [[S.FAILED, S.FAILED], 'FAILED'],
    [[S.SENT, S.FAILED], 'PARTIAL'],
  ])('aggregates %j as %s', (statuses, expected) => {
    expect(aggregateStatus(statuses)).toBe(expected);
  });
});
