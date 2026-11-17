# 06 · Leave Management (Keka/HR flavoured)

> **Implemented (reference).** Read `src/modules/leave-management/`, run `requests/leave-management.http`. Design differences from this ticket: "today" is the date in the company time zone (`Asia/Kolkata`); holidays are already skipped (config list); a leave can't span two calendar years; an employee with no manager can't apply (422); balances are created per year on first use; every balance change goes through `LeaveBalanceService` (reserve / confirm / release / refund); each request keeps a `history` audit trail; events are logged by `LeaveNotifier` (plug in topic 04 to send real messages).

Keka is an HR product, so expect an HR-domain question: leave, attendance, payroll, approvals.

## Requirements
- Employees with a manager. Leave types: `CASUAL`, `SICK`, `EARNED` with yearly quotas.
- Apply for leave (date range, half-day optional). Working days only (skip weekends; holidays as follow-up).
- Manager approves/rejects. Employee can cancel PENDING, or APPROVED if the start date is in the future.
- Balances: `allotted`, `used`, `pending` (applied but not decided) → `available = allotted - used - pending`.

## Entities
- `Employee` (`name`, `email`, `managerId | null`)
- `LeaveBalance` (`employeeId`, `type`, `year`, `allotted`, `used`, `pending`)
- `LeaveRequest` (`employeeId`, `type`, `from`, `to`, `halfDay`, `days`, `reason`, `status`, `approverId`, `decidedAt`, `comment`)
- `LeaveStatus`: `PENDING → APPROVED | REJECTED | CANCELLED`, `APPROVED → CANCELLED` (future only)

## API
| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/employees` | `{ name, email, managerId? }` | 201 (balances seeded) | 400, 404 manager, 409 email |
| GET | `/employees/:id/balances` | – | 200 | 404 |
| POST | `/leaves` | `{ employeeId, type, from, to, halfDay?, reason }` | 201 PENDING | 400 dates, 409 overlap, 422 insufficient balance |
| POST | `/leaves/:id/approve` | `{ approverId, comment? }` | 200 | 403 not the manager, 409 bad transition |
| POST | `/leaves/:id/reject` | `{ approverId, comment }` | 200 | 403, 409 |
| POST | `/leaves/:id/cancel` | `{ employeeId }` | 200 | 403, 409 |
| GET | `/leaves?employeeId=&status=` | – | 200 | – |
| GET | `/managers/:id/pending-approvals` | – | 200 | 404 |

## Patterns
- **State** transitions table + `assertTransition` (same idea as the job scheduler).
- **Strategy** `LeavePolicy` per type: `SICK` may allow backdated, `EARNED` needs 7 days notice, `CASUAL` max 3 consecutive days.
- **Observer**: emit `leave.approved` / `leave.rejected` events. Plug in the notification service (topic 04) if built.

## Edge cases
- `to < from` → 400. Range of only weekend days → 400 (0 working days).
- Overlaps an existing PENDING/APPROVED request of the same employee → 409.
- Insufficient `available` → 422 with `{ available, requested }`.
- Approver isn't the employee's manager → 403. Employee approving their own leave → 403.
- Balance moves: apply → `pending += d`; approve → `pending -= d, used += d`; reject/cancel-pending → `pending -= d`; cancel-approved → `used -= d`.
- Two approve calls at the same time → only one transition succeeds.

## Tickets
- **T1** Employees + balance seeding (quotas from a config map).
- **T2** Date utils: `workingDaysBetween(from, to)` + `overlaps(a, b)`. Unit tests (weekend-only, same day, half-day = 0.5).
- **T3** Apply: DTO (`@IsDateString`, `@IsEnum`) → policy check → overlap → balance check → PENDING + `pending += days`.
- **T4** Transition table + approve/reject with manager authorization.
- **T5** Cancel rules + balance reversal. Pending-approvals + list filters.
- **T6** `LeavePolicy` strategies per type. `.http` covering every error code.

## Hints
- Store dates as `YYYY-MM-DD` strings and compare as strings, or use UTC `Date`s. Mixing local time zones causes off-by-one bugs (say this in the interview).
- Overlap test: `a.from <= b.to && b.from <= a.to`.
- Keep balance updates and status change together in one synchronous method so no `await` can interleave. Mention a DB transaction for production.

## Acceptance
```
POST /employees {"name":"Mgr","email":"m@k.com"}
POST /employees {"name":"Asha","email":"a@k.com","managerId":"<mgr>"}
POST /leaves {"employeeId":"<asha>","type":"CASUAL","from":"2026-11-03","to":"2026-11-04","reason":"trip"}   → 201 days 2
POST /leaves (overlapping 2026-11-04)                                         → 409
POST /leaves/:id/approve {"approverId":"<asha>"}                               → 403
POST /leaves/:id/approve {"approverId":"<mgr>"}                                → 200
GET /employees/<asha>/balances                                                 → CASUAL used 2
POST /leaves/:id/approve {"approverId":"<mgr>"}                                → 409
```
