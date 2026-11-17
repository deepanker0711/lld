# 02 · Parking Lot

> **Implemented (reference).** Read `src/modules/parking-lot/`, run `requests/parking-lot.http`. Design differences from this ticket: the bike → CAR fallback is built in (`ALLOWED_SLOT_TYPES`); vehicle numbers are normalised (`ka-01 ab 1234` = `KA01AB1234`) and "already parked" is checked across all lots; the fee uses the vehicle's rate, not the slot's; unpark charges through an async `PaymentGateway`, so **unpark** takes the `KeyedMutex` (per ticket) while park stays synchronous and needs no lock in one process (T7 explains why).

## Requirements
- A lot has floors; each floor has slots of type `BIKE | CAR | TRUCK`.
- Park a vehicle → get a ticket with the assigned slot. Unpark with the ticket → pay a fee and free the slot.
- Vehicle → slot fit: bike→BIKE, car→CAR, truck→TRUCK (follow-up: a bike may use a CAR slot if no BIKE slot is free).
- Availability per floor and type. A vehicle can't be parked twice.

## Entities
- `ParkingLot` (`name`, `floors`), `Slot` (`floor`, `number`, `type`, `vehicleNumber | null`)
- `Ticket` (`ticketNo`, `vehicleNumber`, `vehicleType`, `slotId`, `entryAt`, `exitAt | null`, `fee | null`, `status: ACTIVE | PAID`)

## API
| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/parking-lots` | `{ name, floors: [{ bike, car, truck }] }` (slot counts per floor) | 201 lot + slot ids | 400 |
| GET | `/parking-lots/:id/availability` | – | 200 `{ floor, BIKE, CAR, TRUCK }[]` | 404 |
| POST | `/parking-lots/:id/park` | `{ vehicleNumber, vehicleType }` | 201 ticket | 404, 409 lot full / already parked |
| POST | `/parking-lots/:id/unpark` | `{ ticketId }` | 200 `{ ticket, fee, durationMinutes }` | 404, 409 already paid |
| GET | `/tickets/:id` | – | 200 | 404 |

## Patterns
- **Strategy** `SlotAllocationStrategy` → `NearestFirstStrategy` (lowest floor, lowest number). Follow-up: `SpreadAcrossFloorsStrategy`.
- **Strategy** `FeeStrategy` → `HourlyFeeStrategy` (rates per vehicle type, round up to the hour, first hour minimum).
- **Factory** not needed unless you support several strategies at runtime.

## Edge cases
- Lot full for that type → 409 `No CAR slot available`.
- Same vehicle number parked while an ACTIVE ticket exists → 409.
- Unpark a ticket twice → 409. Ticket from another lot → 404.
- Two park requests for the last slot at the same time → only one wins.

## Tickets
- **T1** Enums, entities, repositories (`SlotRepository.findFree(lotId, type)`, `TicketRepository.findActiveByVehicle`).
- **T2** Create lot DTO with nested validation (`@ValidateNested({ each: true }) @Type(() => FloorDto)`) → generate slots.
- **T3** `SlotAllocationStrategy` interface + nearest-first, injected via a token.
- **T4** Park: validate → allocate → occupy → create ticket (ticket no from `SequenceGenerator`).
- **T5** `FeeStrategy` + unpark using `Clock`. Unit test the fee with `FakeClock` (0 min, 59 min, 61 min, 3 h).
- **T6** Availability endpoint. `.http` file.
- **T7** Concurrency: wrap park in `KeyedMutex.runExclusive('lot:'+id, ...)`. Explain why it is needed only if there's an `await` inside.

## Hints
- Keep `vehicleType → allowed slot types` as a map: `{ BIKE: [BIKE, CAR], CAR: [CAR], TRUCK: [TRUCK] }`. The follow-up then needs no extra code.
- Fee: `Math.max(1, Math.ceil(minutes / 60)) * rate[type]`.
- To demo fees without waiting, add an optional `exitAt` to the unpark DTO **in dev only**, or just say you use `FakeClock` in tests.

## Acceptance
```
POST /parking-lots {"name":"HQ","floors":[{"bike":1,"car":1,"truck":0}]}   → 201
POST /parking-lots/:id/park {"vehicleNumber":"KA01AB1234","vehicleType":"CAR"} → 201 slot F0-C1
POST /parking-lots/:id/park {"vehicleNumber":"KA01AB9999","vehicleType":"CAR"} → 409 no slot
POST /parking-lots/:id/park {"vehicleNumber":"KA01AB1234","vehicleType":"CAR"} → 409 already parked
POST /parking-lots/:id/unpark {"ticketId":"..."}                               → 200 fee
POST /parking-lots/:id/unpark {"ticketId":"..."}                               → 409 already paid
```
