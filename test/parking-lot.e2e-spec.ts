import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import {
  DEFAULT_PARKING_OPTIONS,
  PARKING_OPTIONS,
} from '../src/modules/parking-lot/domain/parking-options';

describe('Parking lot (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PARKING_OPTIONS)
      .useValue({ ...DEFAULT_PARKING_OPTIONS, paymentLatencyMs: 0 })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, { logRequests: false });
    await app.init();
  });

  afterEach(() => app.close());

  const http = () => request(app.getHttpServer());
  const park = (lotId: string, vehicleNumber: string, vehicleType = 'CAR') =>
    http()
      .post(`/parking-lots/${lotId}/park`)
      .send({ vehicleNumber, vehicleType });

  it('acceptance: park, lot full, already parked, unpark with fee, already paid', async () => {
    const lot = await http()
      .post('/parking-lots')
      .send({ name: 'HQ', floors: [{ bike: 1, car: 1, truck: 0 }] })
      .expect(201);
    const lotId = lot.body.data.id;
    expect(lot.body.data.slots.map((s: { code: string }) => s.code)).toEqual([
      'F0-B1',
      'F0-C1',
    ]);

    const parked = await park(lotId, 'KA01AB1234').expect(201);
    expect(parked.body.data).toMatchObject({
      slotCode: 'F0-C1',
      status: 'ACTIVE',
      ticketNo: 1,
    });
    const ticketId = parked.body.data.id;

    const full = await park(lotId, 'KA01AB9999').expect(409);
    expect(full.body.error.message).toBe('No CAR slot available');
    // normalised: same car, different spacing/case
    const twice = await park(lotId, 'ka-01 ab 1234').expect(409);
    expect(twice.body.error.message).toBe(
      'Vehicle KA01AB1234 is already parked',
    );

    const avail = await http()
      .get(`/parking-lots/${lotId}/availability`)
      .expect(200);
    expect(avail.body.data).toEqual([{ floor: 0, BIKE: 1, CAR: 0, TRUCK: 0 }]);

    const out = await http()
      .post(`/parking-lots/${lotId}/unpark`)
      .send({ ticketId })
      .expect(200);
    expect(out.body.data).toMatchObject({
      fee: 50,
      billableHours: 1,
      ticket: { status: 'PAID' },
    });
    const paid = await http()
      .post(`/parking-lots/${lotId}/unpark`)
      .send({ ticketId })
      .expect(409);
    expect(paid.body.error.message).toBe(
      `Ticket '${ticketId}' is already paid`,
    );

    const ticket = await http().get(`/tickets/${ticketId}`).expect(200);
    expect(ticket.body.data).toMatchObject({
      status: 'PAID',
      fee: 50,
      paymentId: expect.stringMatching(/^pay_/),
    });
    await http().get('/tickets/tkt_nope').expect(404);
  });

  it('validates the nested floor layout and the park body', async () => {
    const bad = await http()
      .post('/parking-lots')
      .send({ name: '', floors: [{ car: -1, boat: 2 }, 'x'] })
      .expect(400);
    expect(bad.body.error.details).toEqual(
      expect.arrayContaining([
        'name should not be empty',
        'floors.0.car must not be less than 0',
        'floors.0.property boat should not exist',
      ]),
    );
    await http()
      .post('/parking-lots')
      .send({ name: 'X', floors: [] })
      .expect(400);
    const empty = await http()
      .post('/parking-lots')
      .send({ name: 'X', floors: [{}] })
      .expect(400);
    expect(empty.body.error.message).toBe(
      'A parking lot needs at least one slot',
    );

    const { body } = await http()
      .post('/parking-lots')
      .send({ name: 'HQ', floors: [{ car: 1 }] })
      .expect(201);
    const badPark = await park(body.data.id, 'K!', 'BOAT').expect(400);
    expect(badPark.body.error.details).toEqual(
      expect.arrayContaining([
        'vehicleNumber must be 4-12 letters or digits, e.g. KA01AB1234',
        expect.stringContaining(
          'vehicleType must be one of the following values',
        ),
      ]),
    );
    await park('lot_nope', 'KA01AB1234').expect(404);
    await http().get('/parking-lots/lot_nope/availability').expect(404);
    await http()
      .post(`/parking-lots/${body.data.id}/unpark`)
      .send({})
      .expect(400);
  });

  it('bike falls back to a car slot; unpark from the wrong lot is 404', async () => {
    const a = await http()
      .post('/parking-lots')
      .send({ name: 'A', floors: [{ car: 1 }] })
      .expect(201);
    const b = await http()
      .post('/parking-lots')
      .send({ name: 'B', floors: [{ car: 1 }] })
      .expect(201);
    const bike = await park(a.body.data.id, 'KA05XY0001', 'BIKE').expect(201);
    expect(bike.body.data).toMatchObject({
      slotCode: 'F0-C1',
      slotType: 'CAR',
      vehicleType: 'BIKE',
    });

    await http()
      .post(`/parking-lots/${b.body.data.id}/unpark`)
      .send({ ticketId: bike.body.data.id })
      .expect(404);
    const lots = await http().get('/parking-lots').expect(200);
    expect(lots.body.data).toHaveLength(2);
  });
});
