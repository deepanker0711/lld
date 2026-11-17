import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

describe('Rate Limiter API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, { logRequests: false });
    await app.init();
  });

  afterEach(() => app.close());

  const http = () => request(app.getHttpServer());
  const ping = (client: string) => http().get('/limited/ping').set('x-client-id', client);

  it('allows 5 then returns 429 with Retry-After (seeded token bucket 5/10s)', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await ping('alice').expect(200);
      expect(res.headers['x-ratelimit-remaining']).toBe(String(4 - i));
    }
    const blocked = await ping('alice').expect(429);
    expect(blocked.headers['retry-after']).toBe('2');
    expect(blocked.body.error).toMatchObject({ code: 'TOO_MANY_REQUESTS' });

    await ping('bob').expect(200); // separate bucket
  });

  it('applies the route-level rule over the class-level one', async () => {
    const search = () => http().get('/limited/search').set('x-client-id', 'c');
    for (let i = 0; i < 3; i++) await search().expect(200);
    await search().expect(429);
    await ping('c').expect(200); // 'default' bucket untouched
  });

  it('manages rules and reports usage', async () => {
    await http()
      .post('/rate-limits/rules')
      .send({ key: 'default', algorithm: 'TOKEN_BUCKET', limit: 1, windowMs: 1000 })
      .expect(409);

    await http().patch('/rate-limits/rules/default').send({ limit: 1 }).expect(200);
    await ping('d').expect(200);
    await ping('d').expect(429);

    const usage = await http().get('/rate-limits/usage/d?rule=default').expect(200);
    expect(usage.body.data).toMatchObject({ rule: 'default', remaining: 0, allowed: false });

    await http().get('/rate-limits/usage/d?rule=nope').expect(404);
    await http().post('/rate-limits/rules').send({ key: 'BAD KEY', algorithm: 'MAGIC', limit: 0 }).expect(400);
  });

  it('does not limit routes without @RateLimit', async () => {
    for (let i = 0; i < 10; i++) await http().get('/health').expect(200);
  });
});
