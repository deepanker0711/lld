# 04 · Notification Service

> **Implemented (reference).** Read `src/modules/notifications/`, run `requests/notifications.http`. Design differences from this ticket: a template key has a variant per channel plus a default (`key:CHANNEL` / `key:DEFAULT`), so the acceptance demo creates a default too; preferences live on the user; a delivery with no recipient is created PENDING and the dispatcher fails it (one writer for outcomes); `bounce` recipients fail permanently (no retry); the notification's status (IN_PROGRESS / SENT / PARTIAL / FAILED) is derived from its deliveries.

## Requirements
- Send a notification to a user on one or more channels: `EMAIL | SMS | PUSH`.
- Templates with placeholders: `"Hi {{name}}, your leave from {{from}} is approved"`.
- User preferences: opted-out channels are skipped. Quiet hours optional (follow-up).
- Each send is tracked per channel: `PENDING → SENT | FAILED`, with retries (max 3, backoff).
- Channel providers are fake (log + random failure rate) so retries can be demoed.

## Entities
- `User` (`name`, `email`, `phone`, `deviceToken`), `Preference` (`userId`, `channel`, `enabled`)
- `Template` (`key`, `channel`, `subject?`, `body`, `variables: string[]`)
- `Notification` (`userId`, `templateKey`, `payload`, `deliveries: Delivery[]`)
- `Delivery` (`channel`, `status`, `attempts`, `lastError`, `sentAt`)

## API
| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/users` | `{ name, email?, phone?, deviceToken? }` | 201 | 400 |
| PUT | `/users/:id/preferences` | `{ channels: { EMAIL: true, SMS: false } }` | 200 | 404 |
| POST | `/templates` | `{ key, channel, subject?, body }` | 201 | 400, 409 |
| POST | `/notifications` | `{ userId, templateKey, channels[], data }` | **202** `{ id, deliveries }` | 400 missing vars, 404 |
| GET | `/notifications/:id` | – | 200 with delivery statuses | 404 |
| GET | `/users/:id/notifications` | – (pagination) | 200 | 404 |

## Patterns
- **Strategy** `NotificationChannel { send(to, message) }` → `EmailChannel`, `SmsChannel`, `PushChannel`.
- **Factory** `ChannelFactory.get(channel)` (a `Map` of injected strategies).
- **Observer / event bus**: `POST` enqueues and returns 202; a dispatcher processes in the background. Use Node's `EventEmitter` or a simple in-memory queue + `setImmediate`.
- **Template method** (optional): base channel does render → validate recipient → send → record.

## Edge cases
- Missing template variable → 400 listing the missing ones (validate before queuing).
- User has no phone but SMS requested → that delivery `FAILED` with "no recipient", others proceed.
- All requested channels opted out → 422.
- Provider failure → retry with backoff 1s, 2s, 4s; after 3 attempts → `FAILED`.
- Idempotency (follow-up): `Idempotency-Key` header returns the same notification id.

## Tickets
- **T1** Users + preferences + templates (CRUD-lite, repositories).
- **T2** Template renderer (`{{var}}` replace + missing-var detection) with unit tests.
- **T3** Channel interface + 3 fake channels (failure rate from env/config) + `ChannelFactory`.
- **T4** `POST /notifications`: validate, filter by preferences, create deliveries `PENDING`, emit event, return 202.
- **T5** Dispatcher: consumes events, sends per channel, updates status, schedules retries with backoff.
- **T6** GET endpoints + `.http` demo showing a delivery going PENDING → SENT/FAILED.

## Hints
- Keep sending out of the request path. That's why the response is 202 Accepted, and it is the main design point.
- Backoff: `delay = base * 2 ** (attempt - 1)`. Use `setTimeout` for the in-memory retry. Say that in production this is BullMQ delayed jobs / SQS visibility timeout + a DLQ.
- To make the demo repeatable, let fake channels fail deterministically (e.g. fail if the recipient contains "fail").

## Acceptance
```
POST /users {"name":"Asha","email":"asha@x.com"}
POST /templates {"key":"leave_approved","channel":"EMAIL","subject":"Leave","body":"Hi {{name}}, approved from {{from}}"}
POST /notifications {"userId":"...","templateKey":"leave_approved","channels":["EMAIL","SMS"],"data":{"name":"Asha","from":"1 Nov"}}
   → 202; EMAIL SENT, SMS FAILED (no phone)
POST /notifications ... "data":{"name":"Asha"}   → 400 missing: from
```
