import { BadRequestError, ConflictError, GoneError, NotFoundError } from '../../common/errors/domain.errors';
import { FakeClock } from '../../common/utils/clock';
import { SequenceGenerator } from '../../common/utils/id.generator';
import { Base62SequenceCodeGenerator, CodeGenerator } from './domain/code-generator';
import { ShortUrlRepository } from './short-url.repository';
import { UrlShortenerService } from './url-shortener.service';

const BASE = 'http://sho.rt';

function setup(generator?: CodeGenerator) {
  const clock = new FakeClock(1_000_000);
  const service = new UrlShortenerService(
    new ShortUrlRepository(),
    generator ?? new Base62SequenceCodeGenerator(new SequenceGenerator()),
    clock,
  );
  return { service, clock };
}

describe('UrlShortenerService', () => {
  it('generates base62 codes from a counter', () => {
    const { service } = setup();
    expect(service.create({ longUrl: 'https://a.com' }, BASE).url).toMatchObject({
      code: '1',
      shortUrl: 'http://sho.rt/1',
      longUrl: 'https://a.com/',
    });
    expect(service.create({ longUrl: 'https://b.com' }, BASE).url.code).toBe('2');
  });

  it('dedupes the same URL, but not when an alias or TTL is given', () => {
    const { service } = setup();
    const first = service.create({ longUrl: 'https://a.com' }, BASE);
    const again = service.create({ longUrl: 'https://A.com/' }, BASE); // normalized to the same URL
    expect(again).toEqual({ url: first.url, created: false });
    expect(service.create({ longUrl: 'https://a.com', alias: 'mine' }, BASE).url.code).toBe('mine');
    expect(service.create({ longUrl: 'https://a.com', ttlSeconds: 60 }, BASE).url.code).not.toBe(first.url.code);
  });

  it('rejects taken and reserved aliases', () => {
    const { service } = setup();
    service.create({ longUrl: 'https://a.com', alias: 'keka' }, BASE);
    expect(() => service.create({ longUrl: 'https://b.com', alias: 'keka' }, BASE)).toThrow(ConflictError);
    expect(() => service.create({ longUrl: 'https://b.com', alias: 'docs' }, BASE)).toThrow(BadRequestError);
  });

  it('skips generated codes that clash with an alias or a reserved word', () => {
    const codes = ['taken', 'urls', 'free'];
    const { service } = setup({ next: () => codes.shift()! });
    service.create({ longUrl: 'https://a.com', alias: 'taken' }, BASE);
    expect(service.create({ longUrl: 'https://b.com' }, BASE).url.code).toBe('free');
  });

  it('resolves, counts clicks, and returns 410 after expiry', () => {
    const { service, clock } = setup();
    const { url } = service.create({ longUrl: 'https://a.com', ttlSeconds: 10 }, BASE);
    expect(service.resolve(url.code)).toBe('https://a.com/');
    clock.advance(9_999);
    service.resolve(url.code);
    expect(service.stats(url.code, BASE)).toMatchObject({ clicks: 2, expired: false });
    clock.advance(1);
    expect(() => service.resolve(url.code)).toThrow(GoneError);
    expect(service.stats(url.code, BASE).expired).toBe(true);
  });

  it('delete removes the code and its dedupe entry', () => {
    const { service } = setup();
    const { url } = service.create({ longUrl: 'https://a.com' }, BASE);
    service.remove(url.code);
    expect(() => service.resolve(url.code)).toThrow(NotFoundError);
    expect(service.create({ longUrl: 'https://a.com' }, BASE).created).toBe(true);
  });
});
