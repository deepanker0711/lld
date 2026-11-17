# 05 · Job Scheduler

> **Implemented (reference).** Read `src/modules/job-scheduler/`, run `requests/job-scheduler.http`. Design differences from this ticket: recurring jobs anchor to a fixed grid (`firstRunAt + k × interval`) and skip missed slots; a recurring job that exhausts retries moves to its next slot instead of FAILED.

## Requirements
- Schedule jobs: **one-off** at a time, **delayed** by N ms, **recurring** every N ms (follow-up: cron).
- Job = `type` (handler name) + `payload`. Handlers are registered in code (`SEND_EMAIL`, `GENERATE_REPORT`, `FAIL_RANDOMLY`).
- Priority: if several jobs are due, higher priority runs first.
- Max N jobs running at once (worker pool size).
- Retries with exponential backoff, then `FAILED`. Cancel a pending job. Execution history.

## Entities
- `Job` (`type`, `payload`, `runAt`, `intervalMs | null`, `priority`, `status`, `attempts`, `maxAttempts`, `lastError`)
- `JobRun` (`jobId`, `startedAt`, `finishedAt`, `status`, `error`)
- `JobStatus`: `SCHEDULED → RUNNING → COMPLETED | FAILED`, `SCHEDULED → CANCELLED`, `RUNNING → SCHEDULED` (retry / next recurrence)

## API
| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/jobs` | `{ type, payload?, runAt? \| delayMs?, intervalMs?, priority?, maxAttempts? }` | 201 | 400 unknown type / both runAt+delayMs / runAt in past |
| GET | `/jobs?status=` | – | 200 | – |
| GET | `/jobs/:id` | – | 200 with runs | 404 |
| POST | `/jobs/:id/cancel` | – | 200 | 404, 409 not cancellable |
| GET | `/scheduler/stats` | – | 200 `{ queued, running, completed, failed }` | – |

## Patterns
- **Priority queue (min-heap)** ordered by `(runAt, -priority)`. Write it yourself; it's often asked.
- **Strategy / registry** `JobHandler { type; handle(payload) }`, collected in a `HandlerRegistry`.
- **State** pattern for status transitions (a transition table `Record<Status, Status[]>` + `assertTransition`).
- **Lifecycle hooks**: start the tick loop in `onModuleInit`, clear it in `onModuleDestroy`.

## Edge cases
- Cancel a RUNNING or COMPLETED job → 409.
- Recurring job: next run = `scheduledRunAt + interval`, not `finishedAt + interval` (explain drift).
- Recurring job cancelled while running → don't reschedule.
- More due jobs than free workers → they wait; priority decides the order.
- Handler throws → retry with backoff until `maxAttempts`, then `FAILED`.

## Tickets
- **T1** `MinHeap<T>` with a comparator: `push`, `pop`, `peek`, `size`. Unit tests (ordering, ties).
- **T2** Entities, status enum, transition table + `assertTransition` (throws `ConflictError`).
- **T3** Handler interface + registry + 3 demo handlers (one sleeps 2s, one fails randomly).
- **T4** `POST /jobs` with DTO validation (`@ValidateIf`, mutually exclusive fields) → push to heap.
- **T5** Scheduler loop: every 100 ms (`setInterval` + `Clock`), while `running < poolSize` and `heap.peek().runAt <= now` → pop → run (don't `await` in the loop).
- **T6** Completion: success → `COMPLETED` or reschedule if recurring; failure → backoff or `FAILED`. Record `JobRun`.
- **T7** Cancel (lazy deletion: mark CANCELLED, skip when popped) + stats + `.http`.

## Hints
- Heap: array, `parent = (i-1)>>1`, children `2i+1`, `2i+2`; `siftUp` on push, `siftDown` on pop.
- Lazy deletion is O(1) for cancel; explain the trade-off (stale entries in the heap).
- Testing the loop: make `tick()` a public method and call it directly with a `FakeClock`, so tests don't depend on real timers.
- Production answer: BullMQ / Redis sorted sets (score = runAt), or Postgres `SELECT … FOR UPDATE SKIP LOCKED` for multiple workers.

## Acceptance
```
POST /jobs {"type":"SEND_EMAIL","delayMs":3000,"payload":{"to":"a@x.com"}}   → SCHEDULED, then COMPLETED after ~3s
POST /jobs {"type":"SEND_EMAIL","intervalMs":5000}                           → runs every 5s (runs list grows)
POST /jobs/:id/cancel                                                         → CANCELLED, stops
POST /jobs {"type":"FAIL_ALWAYS","maxAttempts":3}                             → attempts 3, FAILED
POST /jobs {"type":"NOPE"}                                                    → 400
```
