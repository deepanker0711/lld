import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

describe('LRU Cache API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, { logRequests: false });
    await app.init();
  });

  afterEach(() => app.close());

  const http = () => request(app.getHttpServer());

  it('evicts the least recently used key over HTTP', async () => {
    await http().post('/caches').send({ name: 'users', capacity: 2 }).expect(201);
    await http().put('/caches/users/keys/a').send({ value: { id: 1 } }).expect(200);
    await http().put('/caches/users/keys/b').send({ value: 'two' }).expect(200);
    await http().get('/caches/users/keys/a').expect(200);

    const put = await http().put('/caches/users/keys/c').send({ value: 3 }).expect(200);
    expect(put.body).toEqual({ success: true, data: { key: 'c', value: 3, evictedKey: 'b' } });

    await http().get('/caches/users/keys/b').expect(404);
    const keys = await http().get('/caches/users/keys').expect(200);
    expect(keys.body.data.map((e: { key: string }) => e.key)).toEqual(['c', 'a']);

    const stats = await http().get('/caches/users/stats').expect(200);
    expect(stats.body.data).toMatchObject({ size: 2, hits: 1, misses: 1, evictions: 1 });
  });

  it('returns a validation error envelope for bad payloads', async () => {
    const res = await http().post('/caches').send({ name: 'bad name!', capacity: 0, extra: true }).expect(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        'property extra should not exist',
        'capacity must not be less than 1',
      ]),
    );
  });

  it('returns 409 for a duplicate cache and 404 for unknown ones', async () => {
    await http().post('/caches').send({ name: 'dup', capacity: 1 }).expect(201);
    const dup = await http().post('/caches').send({ name: 'dup', capacity: 1 }).expect(409);
    expect(dup.body.error.code).toBe('CONFLICT');

    const missing = await http().get('/caches/nope/stats').expect(404);
    expect(missing.body.error).toEqual({ code: 'NOT_FOUND', message: "Cache 'nope' not found" });
  });

  it('rejects a put without a value', async () => {
    await http().post('/caches').send({ name: 'c', capacity: 1 }).expect(201);
    await http().put('/caches/c/keys/a').send({}).expect(400);
  });
});
