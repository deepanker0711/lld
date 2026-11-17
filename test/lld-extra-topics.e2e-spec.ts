import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AUTH_OPTIONS, DEFAULT_AUTH_OPTIONS } from '../src/modules/auth/domain/auth-options';
import { CHECKOUT_OPTIONS, DEFAULT_CHECKOUT_OPTIONS } from '../src/modules/cart-checkout/domain/checkout-options';
import { BOOKING_OPTIONS, DEFAULT_BOOKING_OPTIONS } from '../src/modules/movie-booking/domain/booking-options';
import { DEFAULT_WALLET_OPTIONS, WALLET_OPTIONS } from '../src/modules/wallet/domain/wallet-options';

process.env.LOG_CONSOLE = 'off';

describe('Extra LLD topics (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_OPTIONS).useValue({ ...DEFAULT_AUTH_OPTIONS, scryptCost: 1024 })
      .overrideProvider(CHECKOUT_OPTIONS).useValue({ ...DEFAULT_CHECKOUT_OPTIONS, paymentLatencyMs: 0 })
      .overrideProvider(BOOKING_OPTIONS).useValue({ ...DEFAULT_BOOKING_OPTIONS, paymentLatencyMs: 0 })
      .overrideProvider(WALLET_OPTIONS).useValue({ ...DEFAULT_WALLET_OPTIONS, gatewayLatencyMs: 0 })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, { logRequests: false });
    await app.init();
  });

  afterAll(() => app.close());
  const http = () => request(app.getHttpServer());

  it('auth: register, login, me, refresh rotation + reuse, logout, admin role', async () => {
    await http().post('/auth/register').send({ email: 'Asha@Example.com', name: 'Asha', password: 'weak' }).expect(400);
    const user = await http().post('/auth/register').send({ email: 'Asha@Example.com', name: 'Asha', password: 'secret123' }).expect(201);
    expect(user.body.data).not.toHaveProperty('passwordHash');

    await http().post('/auth/login').send({ email: 'asha@example.com', password: 'nope12345' }).expect(401);
    const login = await http().post('/auth/login').send({ email: 'asha@example.com', password: 'secret123' }).expect(200);
    const { accessToken, refreshToken } = login.body.data;

    await http().get('/auth/me').expect(401);
    const me = await http().get('/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(200);
    expect(me.body.data.email).toBe('asha@example.com');
    await http().get('/auth/admin/users').set('Authorization', `Bearer ${accessToken}`).expect(403);

    const r2 = await http().post('/auth/refresh').send({ refreshToken }).expect(200);
    await http().post('/auth/refresh').send({ refreshToken }).expect(401); // reuse → session revoked
    await http().get('/auth/me').set('Authorization', `Bearer ${r2.body.data.accessToken}`).expect(401);
  });

  it('cart & checkout: add, coupon, idempotent checkout, decline keeps the cart', async () => {
    const p = await http().post('/products').send({ sku: 'tee-1', name: 'T-shirt', pricePaise: 499_00, stock: 5 }).expect(201);
    expect(p.body.data.sku).toBe('TEE-1');
    await http().post('/coupons').send({ code: 'save10', kind: 'PERCENT', value: 10 }).expect(201);

    await http().post('/carts/u1/items').send({ productId: p.body.data.id, qty: 2 }).expect(200);
    const cart = await http().put('/carts/u1/coupon').send({ code: 'SAVE10' }).expect(200);
    expect(cart.body.data.totals).toEqual({ subtotalPaise: 998_00, discountPaise: 99_80, taxPaise: 161_68, totalPaise: 1_059_88 });

    await http().post('/carts/u1/checkout').send({ paymentToken: 'tok_ok' }).expect(400); // no key
    const order = await http().post('/carts/u1/checkout').set('Idempotency-Key', 'chk-0000001').send({ paymentToken: 'tok_ok' }).expect(201);
    const replay = await http().post('/carts/u1/checkout').set('Idempotency-Key', 'chk-0000001').send({ paymentToken: 'tok_ok' }).expect(200);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body.data.id).toBe(order.body.data.id);

    await http().post('/carts/u2/items').send({ productId: p.body.data.id, qty: 1 }).expect(200);
    await http().post('/carts/u2/checkout').set('Idempotency-Key', 'chk-0000002').send({ paymentToken: 'tok_decline' }).expect(422);
    expect((await http().get('/carts/u2')).body.data.lines).toHaveLength(1);
  });

  it('movie booking: seat map, hold, conflict, confirm', async () => {
    const cinema = await http().post('/cinemas').send({
      name: 'PVR', city: 'Bengaluru',
      screens: [{ name: 'Audi 1', rows: [{ row: 'A', seats: 3, type: 'REGULAR' }] }],
    }).expect(201);
    const movie = await http().post('/movies').send({ title: 'Dune', durationMin: 155, language: 'English' }).expect(201);
    const startsAt = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const show = await http().post('/shows').send({ movieId: movie.body.data.id, screenId: cinema.body.data.screens[0].id, startsAt, prices: { REGULAR: 250_00 } }).expect(201);
    const showId = show.body.data.id;

    const hold = await http().post(`/shows/${showId}/bookings`).send({ userId: 'u1', seats: ['A1', 'A2'] }).expect(201);
    const clash = await http().post(`/shows/${showId}/bookings`).send({ userId: 'u2', seats: ['A2'] }).expect(409);
    expect(clash.body.error.details).toEqual({ taken: ['A2'] });
    await http().post(`/bookings/${hold.body.data.id}/confirm`).send({ userId: 'u1', paymentToken: 'tok_ok' }).expect(200);
    expect((await http().get(`/shows/${showId}/seats`)).body.data.counts).toEqual({ AVAILABLE: 1, HELD: 0, BOOKED: 2 });
  });

  it('wallet: top-up, transfer, idempotent replay, insufficient funds, ledger balanced', async () => {
    const a = (await http().post('/wallets').send({ userId: 'asha' }).expect(201)).body.data.id;
    const b = (await http().post('/wallets').send({ userId: 'ravi' }).expect(201)).body.data.id;
    await http().post(`/wallets/${a}/top-ups`).set('Idempotency-Key', 'top-0000001').send({ amountPaise: 1_000_00, paymentToken: 'tok_ok' }).expect(201);
    await http().post(`/wallets/${a}/transfers`).set('Idempotency-Key', 'trf-0000001').send({ toWalletId: b, amountPaise: 400_00 }).expect(201);
    await http().post(`/wallets/${a}/transfers`).set('Idempotency-Key', 'trf-0000001').send({ toWalletId: b, amountPaise: 400_00 }).expect(200);
    await http().post(`/wallets/${a}/transfers`).set('Idempotency-Key', 'trf-0000002').send({ toWalletId: b, amountPaise: 700_00 }).expect(422);

    expect((await http().get(`/wallets/${a}`)).body.data.balancePaise).toBe(600_00);
    expect((await http().get('/wallets/ledger-check')).body.data.ok).toBe(true);
  });

  it('splitwise: equal split, balances, simplified debts, settle', async () => {
    const ids: string[] = [];
    for (const n of ['asha', 'ravi', 'meera']) {
      ids.push((await http().post('/splitwise/members').send({ name: n, email: `${n}@x.com` }).expect(201)).body.data.id);
    }
    const g = (await http().post('/splitwise/groups').send({ name: 'Trip', memberIds: ids }).expect(201)).body.data.id;
    await http().post(`/splitwise/groups/${g}/expenses`).send({
      description: 'Hotel', paidBy: ids[0], amountPaise: 900_00, splitType: 'EQUAL', splits: ids.map((memberId) => ({ memberId })),
    }).expect(201);
    const bal = (await http().get(`/splitwise/groups/${g}/balances`)).body.data;
    expect(bal.simplified).toHaveLength(2);
    await http().post(`/splitwise/groups/${g}/settlements`).send({ from: ids[1], to: ids[0], amountPaise: 300_00 }).expect(201);
    await http().post(`/splitwise/groups/${g}/settlements`).send({ from: ids[1], to: ids[0], amountPaise: 1 }).expect(422);
  });

  it('food delivery: place, accept (agent assigned), ready, pick up, deliver', async () => {
    const r = (await http().post('/restaurants').send({ name: 'Meghana', location: { lat: 12.9352, lng: 77.6245 }, menu: [{ name: 'Biryani', pricePaise: 320_00 }] }).expect(201)).body.data;
    const agent = (await http().post('/delivery-agents').send({ name: 'Raju', location: { lat: 12.9365, lng: 77.626 } }).expect(201)).body.data;
    const o = (await http().post('/food-orders').send({ customerId: 'c1', restaurantId: r.id, items: [{ menuItemId: r.menu[0].id, qty: 1 }], deliveryLocation: { lat: 12.9116, lng: 77.6389 } }).expect(201)).body.data;

    await http().post(`/food-orders/${o.id}/pick-up`).send({ agentId: agent.id }).expect(403);
    expect((await http().post(`/food-orders/${o.id}/accept`).send({ restaurantId: r.id }).expect(200)).body.data.agentId).toBe(agent.id);
    await http().post(`/food-orders/${o.id}/pick-up`).send({ agentId: agent.id }).expect(409); // not READY
    await http().post(`/food-orders/${o.id}/ready`).send({ restaurantId: r.id }).expect(200);
    await http().post(`/food-orders/${o.id}/pick-up`).send({ agentId: agent.id }).expect(200);
    expect((await http().post(`/food-orders/${o.id}/deliver`).send({ agentId: agent.id }).expect(200)).body.data.status).toBe('DELIVERED');
  });

  it('logging: runtime level change, request context across awaits, redaction', async () => {
    const before = await http().post('/logging/logs').send({ logger: 'app.orders', level: 'DEBUG', message: 'x' }).expect(201);
    expect(before.body.data.written).toBe(false);
    await http().put('/logging/loggers/app.orders/level').send({ level: 'DEBUG' }).expect(200);

    const demo = await http().post('/logging/demo/checkout').set('x-request-id', 'req-e2e-1').send({}).expect(201);
    const lines = demo.body.data.lines as { logger: string; message: string; context: { requestId: string; userId?: string }; fields: Record<string, unknown> }[];
    expect(lines.map((l) => l.logger)).toEqual(['app.http', 'app.orders', 'app.payment', 'app.orders', 'app.http']);
    expect(lines.every((l) => l.context.requestId === 'req-e2e-1')).toBe(true);
    expect(lines.find((l) => l.message === 'charging card')!.fields.cardNumber).toBe('[REDACTED]');

    const entries = await http().get('/logging/entries').query({ requestId: 'req-e2e-1', level: 'INFO' }).expect(200);
    expect(entries.body.data).toHaveLength(4);
  });
});
