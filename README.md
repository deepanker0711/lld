# LLD Practice: NestJS base for machine-coding rounds

An in-memory NestJS API base. Add one module per LLD problem, run it, and demo it with curl, `.http` files or Swagger.

```bash
npm install
npm run start:dev          # http://localhost:3000, Swagger UI at /docs
npm test                   # unit tests (Vitest)
npm run test:e2e           # HTTP tests (supertest)
```

The worked example is `src/modules/lru-cache`. Demo it with `requests/lru-cache.http`.
Problems to build yourself are in `docs/tickets/`. Time plan for the round: `docs/INTERVIEW_PLAYBOOK.md`.

---

## 1. Request flow

```
HTTP request
  └─ ValidationPipe        DTO + class-validator. 400 before your code runs
      └─ Controller        thin: read params/body, call service, return result
          └─ Service       business rules, throws DomainErrors
              └─ Repository (interface)  ← InMemoryRepository (Map)
  ◄─ ResponseInterceptor   success -> { success: true, data }
  ◄─ AllExceptionsFilter   any error -> { success: false, error: { code, message, details? } }
```

Three points to say in the interview:

1. **Thin controllers, fat services.** Services don't import HTTP code, so you can unit test them and reuse them from a CLI, a queue consumer, or a cron job.
2. **Storage behind an interface (`IRepository<T>`).** Today it is a `Map`. To move to Postgres, write a `TypeOrmRepository<T>` that implements the same interface and change one provider. The services don't change.
3. **Domain errors, not HTTP errors.** Services throw `NotFoundError` / `ConflictError` / ... (plain TS classes). One global filter maps them to status codes, so the domain doesn't depend on HTTP.

## 2. What's in `src/common`

| File | Use it for |
|---|---|
| `entities/base.entity.ts` | `id`, `createdAt`, `updatedAt`. Every entity extends it |
| `repository/in-memory.repository.ts` | `create / findById / findByIdOrThrow / findAll(pred) / findOne(pred) / update / delete / count / exists` |
| `errors/domain.errors.ts` | `BadRequestError 400`, `ForbiddenError 403`, `NotFoundError 404`, `ConflictError 409`, `UnprocessableError 422`, `TooManyRequestsError 429` |
| `utils/clock.ts` | Inject `Clock` for anything time based. `FakeClock` in tests (`advance(ms)`) |
| `utils/id.generator.ts` | `generateId('tkt')`, `toBase62(n)`, `SequenceGenerator.next('ticket')` |
| `utils/keyed-mutex.ts` | `mutex.runExclusive(key, fn)` for concurrent booking/allocation |
| `dto/pagination.dto.ts` | `@Query() q: PaginationDto` + `paginate(items, q)` |

`Clock`, `SequenceGenerator` and `KeyedMutex` come from a `@Global()` module. Inject them anywhere without importing the module.

## 3. Starting a new LLD topic

```bash
nest g module modules/parking-lot
nest g controller modules/parking-lot
nest g service modules/parking-lot
```
(The CLI registers the module in `app.module.ts` for you. Check that it did.)

Then, in this order:

```ts
// 1. enums + entity: models/slot.entity.ts
export enum VehicleType { BIKE = 'BIKE', CAR = 'CAR', TRUCK = 'TRUCK' }
export class Slot extends BaseEntity {
  floor: number;
  type: VehicleType;
  occupiedBy: string | null;
}

// 2. repository: add query methods for your domain
@Injectable()
export class SlotRepository extends InMemoryRepository<Slot> {
  constructor() { super('Slot', 'slot'); }
  findFree(type: VehicleType) { return this.findAll(s => s.type === type && !s.occupiedBy); }
}

// 3. DTO: one class per request body
export class ParkDto {
  @IsString() @IsNotEmpty() vehicleNumber: string;
  @IsEnum(VehicleType) type: VehicleType;
}

// 4. service: all rules here, throw DomainErrors
const slot = this.slots.findFree(dto.type)[0];
if (!slot) throw new ConflictError(`No free ${dto.type} slot`);

// 5. controller: one line per endpoint
@Post('park') park(@Body() dto: ParkDto) { return this.service.park(dto); }

// 6. module: register the repository + any strategies
providers: [ParkingLotService, SlotRepository, { provide: FEE_STRATEGY, useClass: HourlyFeeStrategy }]
```

Last step: write `requests/<topic>.http` with the happy path first, then the error cases.

## 4. class-validator cheat sheet

```ts
@IsString() @IsNotEmpty() @MaxLength(50)   name: string;
@IsInt() @Min(1) @Max(100)                  capacity: number;
@IsEnum(Status)                             status: Status;
@IsOptional() @IsEmail()                    email?: string;
@IsUrl({ require_protocol: true })          url: string;
@IsDateString()                             startDate: string;   // '2026-11-01'
@IsArray() @ArrayNotEmpty() @IsEnum(Channel, { each: true })  channels: Channel[];
@ValidateNested({ each: true }) @Type(() => ItemDto)          items: ItemDto[];
@Matches(/^[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}$/)  vehicleNumber: string;
```
- Path params: `@Param('id', ParseIntPipe) id: number`, `ParseUUIDPipe`, `new ParseEnumPipe(Type)`.
- Partial updates: `export class UpdateXDto extends PartialType(CreateXDto) {}` (import from `@nestjs/swagger` so the docs stay correct).
- The pipe uses `whitelist + forbidNonWhitelisted`, so unknown fields return 400 and are never silently accepted.

## 5. Status codes

`POST` → 201 by default. Use `@HttpCode(200)` for action endpoints (`/park`, `/approve`).
Redirects: `@Redirect()` or `res.redirect(302, url)`. Custom headers: `@Header()` or `res.setHeader` with `@Res({ passthrough: true })`.
For no envelope on a route (like a redirect), use `@Res()`. The interceptor won't wrap it.

## 6. Gotcha: `import type` in decorated signatures

```
TS1272: A type referenced in a decorated signature must be imported with 'import type'...
```
An interface or type-only import used in a constructor/handler of a decorated class (`@Res() res: Response`, `@Inject(TOKEN) gen: CodeGenerator`) must be imported as a type:
```ts
import type { Request, Response } from 'express';
import { CODE_GENERATOR, type CodeGenerator } from './domain/code-generator';
```
Classes (services, DTOs) are values, so a normal import is fine for them.

## 7. Gotcha: booleans and `enableImplicitConversion`

Implicit conversion runs `Boolean(value)` **before** validation, so `"no"`, `"false"` and `1` all become `true` and `@IsBoolean()` passes. Use `@RawValue()` from `common/validators` to validate what the client actually sent:
```ts
@IsOptional() @RawValue() @IsBoolean() SMS?: boolean;
```
Query-string booleans (`?active=false`) are always strings, so there use `@Transform(({ value }) => value === 'true')` with `@IsBoolean()` instead.

Also in `common/validators`: `@IsMutuallyExclusiveWith('other')` for "either A or B, not both".
