import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { Clock, FakeClock } from '../src/common/utils/clock';

/** Monday 2026-11-02, 10:00 IST, frozen so the dates below never go stale. */
const NOW = Date.parse('2026-11-02T04:30:00.000Z');

describe('Leave management (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(new FakeClock(NOW))
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, { logRequests: false });
    await app.init();
  });

  afterEach(() => app.close());

  const http = () => request(app.getHttpServer());
  const employee = async (name: string, email: string, managerId?: string) =>
    (
      await http()
        .post('/employees')
        .send({ name, email, managerId })
        .expect(201)
    ).body.data.id as string;
  const apply = (employeeId: string, body: object = {}) =>
    http()
      .post('/leaves')
      .send({
        employeeId,
        type: 'CASUAL',
        from: '2026-11-03',
        to: '2026-11-04',
        reason: 'trip',
        ...body,
      });

  it('acceptance: apply, overlap 409, self-approve 403, approve, balance, approve again 409', async () => {
    const mgr = await employee('Mgr', 'm@k.com');
    const asha = await employee('Asha', 'a@k.com', mgr);

    const created = await apply(asha).expect(201);
    expect(created.body.data).toMatchObject({ status: 'PENDING', days: 2 });
    const id = created.body.data.id;

    await apply(asha, { from: '2026-11-04', to: '2026-11-04' }).expect(409);
    const self = await http()
      .post(`/leaves/${id}/approve`)
      .send({ approverId: asha })
      .expect(403);
    expect(self.body.error.message).toBe(
      'You cannot approve or reject your own leave',
    );

    const inbox = await http()
      .get(`/managers/${mgr}/pending-approvals`)
      .expect(200);
    expect(inbox.body.data).toEqual([
      expect.objectContaining({ id, employeeName: 'Asha' }),
    ]);

    await http()
      .post(`/leaves/${id}/approve`)
      .send({ approverId: mgr })
      .expect(200);
    const balances = await http()
      .get(`/employees/${asha}/balances`)
      .expect(200);
    expect(balances.body.data[0]).toEqual({
      type: 'CASUAL',
      year: 2026,
      allotted: 12,
      used: 2,
      pending: 0,
      available: 10,
    });
    await http()
      .post(`/leaves/${id}/approve`)
      .send({ approverId: mgr })
      .expect(409);

    const cancelled = await http()
      .post(`/leaves/${id}/cancel`)
      .send({ employeeId: asha })
      .expect(200);
    expect(
      cancelled.body.data.history.map((h: { status: string }) => h.status),
    ).toEqual(['PENDING', 'APPROVED', 'CANCELLED']);
  });

  it('validates DTOs: dates, enum, booleans, required reject comment, email', async () => {
    const mgr = await employee('Mgr', 'm@k.com');
    const asha = await employee('Asha', 'a@k.com', mgr);
    await http()
      .post('/employees')
      .send({ name: 'Dup', email: 'A@K.com' })
      .expect(409); // case-insensitive

    const bad = await apply(asha, {
      type: 'VACATION',
      from: '2026-02-30',
      to: 'tomorrow',
      halfDay: 'no',
    }).expect(400);
    expect(bad.body.error.details).toEqual(
      expect.arrayContaining([
        expect.stringContaining('type must be one of the following values'),
        'from is not a real calendar date',
        'to must be a date like 2026-11-03',
        'halfDay must be a boolean value',
      ]),
    );

    const id = (await apply(asha).expect(201)).body.data.id;
    const noComment = await http()
      .post(`/leaves/${id}/reject`)
      .send({ approverId: mgr })
      .expect(400);
    expect(noComment.body.error.details).toContain(
      'comment is required when rejecting',
    );

    const weekend = await apply(asha, {
      from: '2026-11-07',
      to: '2026-11-08',
    }).expect(400);
    expect(weekend.body.error.message).toContain('no working days');
    const earned = await apply(asha, {
      type: 'EARNED',
      from: '2026-11-05',
      to: '2026-11-05',
    }).expect(422);
    expect(earned.body.error.message).toBe('EARNED leave needs 7 days notice');

    await http().get('/employees/emp_nope/balances').expect(404);
    await http().get('/managers/emp_nope/pending-approvals').expect(404);
    await http().get('/leaves?status=NOPE').expect(400);
    const list = await http()
      .get(`/leaves?employeeId=${asha}&status=PENDING`)
      .expect(200);
    expect(list.body.data).toHaveLength(1);
  });
});
