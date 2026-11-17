import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

describe('URL Shortener API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, { logRequests: false });
    await app.init();
  });

  afterEach(() => app.close());

  const http = () => request(app.getHttpServer());

  it('creates, dedupes, redirects with 302 and counts clicks', async () => {
    const created = await http().post('/urls').send({ longUrl: 'https://keka.com/careers' }).expect(201);
    const { code, shortUrl } = created.body.data;
    expect(shortUrl).toMatch(new RegExp(`/${code}$`));

    const again = await http().post('/urls').send({ longUrl: 'https://keka.com/careers' }).expect(200);
    expect(again.body.data.code).toBe(code);

    const redirect = await http().get(`/${code}`).expect(302);
    expect(redirect.headers.location).toBe('https://keka.com/careers');

    const stats = await http().get(`/urls/${code}/stats`).expect(200);
    expect(stats.body.data).toMatchObject({ clicks: 1, expired: false });
  });

  it('supports custom aliases and rejects duplicates and reserved words', async () => {
    await http().post('/urls').send({ longUrl: 'https://x.com', alias: 'keka' }).expect(201);
    const dup = await http().post('/urls').send({ longUrl: 'https://y.com', alias: 'keka' }).expect(409);
    expect(dup.body.error.code).toBe('CONFLICT');
    await http().post('/urls').send({ longUrl: 'https://y.com', alias: 'health' }).expect(400);
    await http().get('/keka').expect(302).expect('location', 'https://x.com/');
  });

  it('validates input', async () => {
    const res = await http().post('/urls').send({ longUrl: 'not-a-url', alias: 'a!' }).expect(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining(['longUrl must be an http(s) URL', 'alias must be 4-20 chars: letters, digits, _ or -']),
    );
    await http().post('/urls').send({ longUrl: 'ftp://files.com' }).expect(400);
  });

  it('returns 404 for unknown codes and keeps other routes reachable', async () => {
    await http().get('/nope123').expect(404);
    await http().get('/health').expect(200);
    await http().get('/caches').expect(200);
  });

  it('deletes a link', async () => {
    const { body } = await http().post('/urls').send({ longUrl: 'https://a.com', alias: 'gone' }).expect(201);
    await http().delete(`/urls/${body.data.code}`).expect(200);
    await http().get('/gone').expect(404);
  });
});
