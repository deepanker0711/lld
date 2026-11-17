import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import {
  DEFAULT_NOTIFICATION_OPTIONS,
  NOTIFICATION_OPTIONS,
} from '../src/modules/notifications/domain/notification-options';

describe('Notifications: users, preferences, templates (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, { logRequests: false });
    await app.init();
  });

  afterEach(() => app.close());

  const http = () => request(app.getHttpServer());

  it('creates a user and merges preference updates', async () => {
    const { body } = await http()
      .post('/users')
      .send({ name: 'Asha', email: 'asha@x.com' })
      .expect(201);
    const id = body.data.id;

    const res = await http()
      .put(`/users/${id}/preferences`)
      .send({ channels: { SMS: false } })
      .expect(200);
    expect(res.body.data.preferences).toEqual({
      EMAIL: true,
      SMS: false,
      PUSH: true,
    });
    await http().get(`/users/${id}`).expect(200);
  });

  it('validates user contacts and preference keys', async () => {
    const bad = await http()
      .post('/users')
      .send({ name: '', email: 'nope', phone: '98765' })
      .expect(400);
    expect(bad.body.error.details).toEqual(
      expect.arrayContaining([
        'name should not be empty',
        'email must be an email',
        'phone must be E.164, e.g. +919876543210',
      ]),
    );

    const { body } = await http()
      .post('/users')
      .send({ name: 'Ravi' })
      .expect(201);
    const prefs = await http()
      .put(`/users/${body.data.id}/preferences`)
      .send({ channels: { FAX: true, SMS: 'no' } })
      .expect(400);
    expect(prefs.body.error.details).toEqual(
      expect.arrayContaining([
        'channels.property FAX should not exist',
        'channels.SMS must be a boolean value',
      ]),
    );
    await http().put(`/users/${body.data.id}/preferences`).send({}).expect(400);
    await http()
      .put('/users/usr_missing/preferences')
      .send({ channels: {} })
      .expect(404);
  });

  it('creates template variants, requires a subject for EMAIL, and 409s on duplicates', async () => {
    const email = await http()
      .post('/templates')
      .send({
        key: 'leave_approved',
        channel: 'EMAIL',
        subject: 'Leave',
        body: 'Hi {{name}}, approved from {{from}}',
      })
      .expect(201);
    expect(email.body.data.variables).toEqual(['name', 'from']);

    const noSubject = await http()
      .post('/templates')
      .send({ key: 'leave_approved', channel: 'EMAIL', body: 'x' })
      .expect(400);
    expect(noSubject.body.error.details).toContain(
      'subject is required for EMAIL templates',
    );

    await http()
      .post('/templates')
      .send({ key: 'leave_approved', body: 'Leave approved, {{name}}' })
      .expect(201);
    await http()
      .post('/templates')
      .send({
        key: 'leave_approved',
        channel: 'EMAIL',
        subject: 'Again',
        body: 'x',
      })
      .expect(409);

    const variants = await http().get('/templates/leave_approved').expect(200);
    expect(variants.body.data.map((t: { id: string }) => t.id)).toEqual([
      'leave_approved:EMAIL',
      'leave_approved:DEFAULT',
    ]);
    await http().get('/templates/nope').expect(404);
    await http()
      .post('/templates')
      .send({ key: 'Bad Key!', channel: 'FAX', body: '' })
      .expect(400);
  });
});

describe('Notifications: send and track deliveries (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Real timers here, so shrink the backoff: retries at 20ms, 40ms instead of 1s, 2s.
      .overrideProvider(NOTIFICATION_OPTIONS)
      .useValue({
        ...DEFAULT_NOTIFICATION_OPTIONS,
        baseBackoffMs: 20,
        fakeLatencyMs: 0,
      })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, { logRequests: false });
    await app.init();
  });

  afterEach(() => app.close());

  const http = () => request(app.getHttpServer());

  async function waitForStatus(id: string, status: string, timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const { body } = await http().get(`/notifications/${id}`).expect(200);
      if (body.data.status === status) return body.data;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`notification ${id} did not reach ${status}`);
  }

  async function setup(contacts: Record<string, string>) {
    await http().post('/templates').send({
      key: 'leave_approved',
      channel: 'EMAIL',
      subject: 'Leave',
      body: 'Hi {{name}}, approved from {{from}}',
    });
    await http()
      .post('/templates')
      .send({ key: 'leave_approved', body: 'Leave from {{from}} approved' });
    const { body } = await http()
      .post('/users')
      .send({ name: 'Asha', ...contacts })
      .expect(201);
    return body.data.id as string;
  }

  const notify = (userId: string, channels: string[], data: object) =>
    http()
      .post('/notifications')
      .send({ userId, templateKey: 'leave_approved', channels, data });

  it('acceptance: 202 PENDING, then EMAIL SENT and SMS FAILED (no phone)', async () => {
    const userId = await setup({ email: 'asha@x.com' });
    const res = await notify(userId, ['EMAIL', 'SMS'], {
      name: 'Asha',
      from: '1 Nov',
    }).expect(202);
    expect(res.body.data.status).toBe('IN_PROGRESS');
    expect(
      res.body.data.deliveries.map((d: { status: string }) => d.status),
    ).toEqual(['PENDING', 'PENDING']);

    const done = await waitForStatus(res.body.data.id, 'PARTIAL');
    expect(done.deliveries).toEqual([
      expect.objectContaining({
        channel: 'EMAIL',
        status: 'SENT',
        attempts: 1,
        body: 'Hi Asha, approved from 1 Nov',
      }),
      expect.objectContaining({
        channel: 'SMS',
        status: 'FAILED',
        attempts: 0,
        lastError: 'No recipient: user has no SMS address',
      }),
    ]);

    const missing = await notify(userId, ['EMAIL'], { name: 'Asha' }).expect(
      400,
    );
    expect(missing.body.error).toMatchObject({
      message: 'Missing template variables: from',
      details: { missing: ['from'] },
    });
  });

  it('retries with backoff: "flaky" ends SENT on attempt 2, "fail" ends FAILED after 3', async () => {
    const flaky = await setup({ email: 'flaky@x.com' });
    const a = await notify(flaky, ['EMAIL'], { name: 'A', from: 'x' }).expect(
      202,
    );
    const sent = await waitForStatus(a.body.data.id, 'SENT');
    expect(sent.deliveries[0]).toMatchObject({
      attempts: 2,
      lastError: 'EMAIL provider timeout (simulated, first call)',
    });

    const { body } = await http()
      .post('/users')
      .send({ name: 'B', email: 'fail@x.com' })
      .expect(201);
    const b = await notify(body.data.id, ['EMAIL'], {
      name: 'B',
      from: 'x',
    }).expect(202);
    const failed = await waitForStatus(b.body.data.id, 'FAILED');
    expect(failed.deliveries[0]).toMatchObject({
      attempts: 3,
      nextAttemptAt: null,
      lastError: 'EMAIL provider unavailable (simulated)',
    });
  });

  it('skips opted-out channels, 422s when all are opted out, validates the body, pages history', async () => {
    const userId = await setup({ email: 'asha@x.com', deviceToken: 'tok-1' });
    await http()
      .put(`/users/${userId}/preferences`)
      .send({ channels: { PUSH: false } })
      .expect(200);

    const res = await notify(userId, ['EMAIL', 'PUSH'], {
      name: 'Asha',
      from: '1 Nov',
    }).expect(202);
    expect(res.body.data.skipped).toEqual([
      { channel: 'PUSH', reason: 'OPTED_OUT' },
    ]);
    expect(res.body.data.deliveries).toHaveLength(1);

    const all = await notify(userId, ['PUSH'], {}).expect(422);
    expect(all.body.error.details).toEqual({ optedOut: ['PUSH'] });

    const bad = await http()
      .post('/notifications')
      .send({
        userId,
        templateKey: 'leave_approved',
        channels: ['FAX', 'EMAIL', 'EMAIL'],
      })
      .expect(400);
    expect(bad.body.error.details).toEqual(
      expect.arrayContaining([
        expect.stringContaining('each value in channels must be one of'),
        "All channels's elements must be unique",
      ]),
    );
    await notify(userId, [], {}).expect(400);
    await notify('usr_nope', ['EMAIL'], {}).expect(404);
    await http().get('/notifications/ntf_nope').expect(404);

    const page = await http()
      .get(`/users/${userId}/notifications?limit=1`)
      .expect(200);
    expect(page.body.data).toMatchObject({ total: 1, page: 1, limit: 1 });
    expect(page.body.data.items[0].id).toBe(res.body.data.id);
    await http().get('/users/usr_nope/notifications').expect(404);
  });
});
