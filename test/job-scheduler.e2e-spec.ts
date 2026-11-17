import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

describe('Job Scheduler API (e2e)', () => {
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

  it('creates a delayed job with defaults and fetches it', async () => {
    const before = Date.now();
    const res = await http()
      .post('/jobs')
      .send({
        type: 'SEND_EMAIL',
        delayMs: 3000,
        payload: { to: 'a@x.com', meta: { nested: true } },
      })
      .expect(201);
    const job = res.body.data;
    expect(job).toMatchObject({
      type: 'SEND_EMAIL',
      status: 'SCHEDULED',
      payload: { to: 'a@x.com', meta: { nested: true } }, // free-form payload is not whitelisted away
      priority: 0,
      maxAttempts: 3,
      intervalMs: null,
    });
    expect(Date.parse(job.runAt)).toBeGreaterThanOrEqual(before + 3000);
    await http().get(`/jobs/${job.id}`).expect(200);
  });

  it('rejects runAt together with delayMs', async () => {
    const res = await http()
      .post('/jobs')
      .send({
        type: 'SEND_EMAIL',
        runAt: '2099-01-01T00:00:00Z',
        delayMs: 1000,
      })
      .expect(400);
    expect(res.body.error.details).toContain(
      'Provide either runAt or delayMs, not both',
    );
  });

  it('rejects unknown types with the list of known ones', async () => {
    const res = await http().post('/jobs').send({ type: 'NOPE' }).expect(400);
    expect(res.body.error.details.knownTypes).toContain('SEND_EMAIL');
  });

  it('rejects runAt in the past and malformed fields', async () => {
    await http()
      .post('/jobs')
      .send({ type: 'SEND_EMAIL', runAt: '2020-01-01T00:00:00Z' })
      .expect(400);
    const res = await http()
      .post('/jobs')
      .send({
        type: 'SEND_EMAIL',
        runAt: 'tomorrow',
        priority: 11,
        intervalMs: 10,
        extra: 1,
      })
      .expect(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        'runAt must be an ISO 8601 date, e.g. 2026-11-02T10:00:00Z',
        'priority must not be greater than 10',
        'intervalMs must not be less than 1000',
        'property extra should not exist',
      ]),
    );
  });

  it('returns 404 for an unknown job', async () => {
    await http().get('/jobs/job_missing').expect(404);
  });
});

describe('Job Scheduler execution (e2e, real timers)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, { logRequests: false });
    await app.init(); // onModuleInit starts the real 100ms tick loop
  });

  afterEach(() => app.close());

  const http = () => request(app.getHttpServer());

  /** Poll GET /jobs/:id until the status matches (or time out). */
  async function waitForStatus(id: string, status: string, timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const { body } = await http().get(`/jobs/${id}`).expect(200);
      if (body.data.status === status) return body.data;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`job ${id} did not reach ${status}`);
  }

  it('runs a due job to COMPLETED and records the run', async () => {
    const { body } = await http()
      .post('/jobs')
      .send({ type: 'SEND_EMAIL', payload: { to: 'a@x.com' } })
      .expect(201);
    const job = await waitForStatus(body.data.id, 'COMPLETED');
    expect(job.runs).toHaveLength(1);
    expect(job.runs[0]).toMatchObject({ attempt: 1, status: 'SUCCEEDED' });
  });

  it('marks a failing job FAILED when maxAttempts is 1', async () => {
    const { body } = await http()
      .post('/jobs')
      .send({ type: 'FAIL_ALWAYS', maxAttempts: 1 })
      .expect(201);
    const job = await waitForStatus(body.data.id, 'FAILED');
    expect(job.lastError).toBe('always fails (attempt 1)');
  });

  it('cancels a scheduled job, rejects a second cancel, filters and reports stats', async () => {
    const { body } = await http()
      .post('/jobs')
      .send({ type: 'SEND_EMAIL', delayMs: 60_000 })
      .expect(201);
    const id = body.data.id;

    const cancelled = await http().post(`/jobs/${id}/cancel`).expect(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');
    const again = await http().post(`/jobs/${id}/cancel`).expect(409);
    expect(again.body.error.message).toBe(
      `Job '${id}' cannot move from CANCELLED to CANCELLED`,
    );

    const list = await http().get('/jobs?status=CANCELLED').expect(200);
    expect(list.body.data.map((j: { id: string }) => j.id)).toEqual([id]);
    await http().get('/jobs?status=NOPE').expect(400);

    const stats = await http().get('/scheduler/stats').expect(200);
    expect(stats.body.data).toMatchObject({
      jobs: { CANCELLED: 1 },
      workers: { size: 2 },
      heapEntries: 1,
    });
  });
});
