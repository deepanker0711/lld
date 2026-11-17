# LLD machine-coding round: 60-minute playbook

## 0–5 min: Clarify (say these out loud)
- **Actors**: who calls the API? (user, admin, system/cron)
- **Core use cases**: list 3–5, agree which are must-have and which are nice-to-have.
- **Scale/constraints**: single instance? In memory is OK? Concurrency matters?
- **Out of scope**: auth, payments, persistence. Say "I'll keep these behind interfaces."

## 5–15 min: Model (write it in a comment or on the whiteboard)
- Entities + relationships (1–N, N–N), enums for every status/type.
- **State machine** for anything with a lifecycle (ticket, job, leave, notification).
- API list: `METHOD /path → body → response → errors`.
- Name the patterns you'll use, and *why* (see below).

## 15–40 min: Core logic first
- Enums → entities → repositories → service → unit-testable domain classes.
- Put the interesting algorithm (allocation, eviction, scheduling, rate limiting) in a **plain class** under `domain/`, not in the controller.
- Throw DomainErrors for every rule. Each one becomes a demo case.

## 40–55 min: Wire and demo
- DTOs + controller, write the `.http` file, run it: happy path, then 400, 404, 409.
- If time allows: one unit test for the core algorithm with `FakeClock`.

## 55–60 min: Extensions (talk, don't code)
- Persistence: swap the repository implementation.
- Multi-instance: in-memory state → Redis; KeyedMutex → Redis lock / DB row lock / optimistic versioning.
- Async work: in-process queue → BullMQ/Kafka; retries + DLQ.
- Observability: logs with request IDs, metrics (hit rate, queue depth).

---

## Pattern → when to use it

| Pattern | Use when | Example |
|---|---|---|
| **Strategy** | Several interchangeable algorithms | slot allocation, fee calculation, eviction, rate-limit algorithm, notification channel |
| **Factory** | Pick a Strategy from a type/enum | `createEvictionPolicy('LRU')`, `channelFactory.get('SMS')` |
| **State** | Object behaves differently per status, with transitions you must enforce | leave/job/ticket lifecycle |
| **Observer / events** | Side effects that shouldn't block the main flow | "leave approved → notify", "job failed → alert" |
| **Singleton** | One shared instance | Nest providers are singletons by default. Say this |
| **Builder / Template method** | Complex object setup / fixed steps with variations | notification template rendering |
| **Repository** | Hide storage | `InMemoryRepository<T>` |

Nest DI for strategies:
```ts
export const FEE_STRATEGY = Symbol('FEE_STRATEGY');
providers: [{ provide: FEE_STRATEGY, useClass: HourlyFeeStrategy }]
constructor(@Inject(FEE_STRATEGY) private readonly fee: FeeStrategy) {}
```
Several strategies picked at runtime: register all of them, then inject a factory that holds a `Map<Type, Strategy>`.

## Follow-up questions to prepare for
- *"Two requests park in the last slot at the same time?"* → Node is single threaded, so a synchronous critical section is already atomic. Once there is an `await` inside, use KeyedMutex. Across instances, use a DB unique constraint / `SELECT … FOR UPDATE` / optimistic version column.
- *"Server restarts?"* → in-memory data is lost; the repository interface means we swap in a DB.
- *"Idempotency?"* → `Idempotency-Key` header + store of key → response.
- *"How would you test it?"* → domain classes are plain TS: unit test them with `FakeClock`; e2e with supertest.
