# 01 · URL Shortener

> **Implemented (reference).** Read `src/modules/url-shortener/`, run `requests/url-shortener.http`. Handbook chapter has the walkthrough and senior follow-ups.

## Requirements
- Shorten a long URL to a short code. Optional custom alias. Optional expiry.
- `GET /:code` redirects (302) to the long URL and counts the click.
- Stats per code: clicks, created, last accessed.
- The same long URL shortened twice without an alias returns the **same** code (dedupe).

## Entities
- `ShortUrl extends BaseEntity` – `code`, `longUrl`, `expiresAt: Date | null`, `clicks`, `lastAccessedAt: Date | null`, `isCustom`

## API
| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/urls` | `{ longUrl, alias?, ttlSeconds? }` | 201 `{ code, shortUrl, longUrl, expiresAt }` | 400 invalid URL/alias, 409 alias taken |
| GET | `/:code` | – | **302** `Location: longUrl` | 404 unknown, 410 expired |
| GET | `/urls/:code/stats` | – | 200 stats | 404 |
| DELETE | `/urls/:code` | – | 200 | 404 |

## Patterns
- **Strategy** `CodeGenerator` interface → `Base62SequenceGenerator` (default), `RandomCodeGenerator` (follow-up).

## Edge cases
- Invalid URL / no protocol → 400. Alias with illegal chars or length outside 4–20 → 400.
- Alias equal to an existing code → 409. Alias equal to a reserved route (`urls`, `docs`, `health`) → 400.
- Expired code → 410 Gone (add a `GoneError` to `domain.errors.ts`).
- Dedupe must **not** return a custom alias or an expired code.

## Tickets
- **T1** Module scaffold + `ShortUrl` entity + `ShortUrlRepository` with `findByCode`, `findByLongUrl`.
- **T2** `CreateShortUrlDto` with validation (`@IsUrl`, `@Matches`, `@Length`, `@IsInt @Min(1)`).
- **T3** `CodeGenerator` strategy + base62 implementation using `SequenceGenerator` + `toBase62`.
- **T4** `POST /urls` with alias + dedupe rules.
- **T5** Redirect endpoint with click counting + expiry (inject `Clock`).
- **T6** Stats + delete. `.http` file. Unit test the generator and expiry.

## Hints
- Redirect bypasses the response envelope: `@Get(':code') redirect(@Param('code') c, @Res() res: Response)` → `res.redirect(302, url)`.
- Register the `/:code` controller **last** (or give it its own module imported last), otherwise it catches `/health`, `/docs`.
- Why base62 of a counter? No collisions, short, O(1). The downside is that codes are guessable. A follow-up is to shuffle with a secret or start the counter high (e.g. 100000 gives a 3+ char code).
- 302 vs 301: 301 is cached by browsers, so you'd lose click counts.

## Acceptance
```
POST /urls {"longUrl":"https://keka.com/careers"}          → 201 code "1"
POST /urls {"longUrl":"https://keka.com/careers"}          → 201 same code
POST /urls {"longUrl":"https://x.com","alias":"keka"}      → 201
POST /urls {"longUrl":"https://y.com","alias":"keka"}      → 409
POST /urls {"longUrl":"not-a-url"}                         → 400
curl -i localhost:3000/keka                                 → 302 Location: https://x.com
GET /urls/keka/stats                                        → clicks: 1
```
