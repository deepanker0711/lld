import { Module } from '@nestjs/common';
import { FEE_STRATEGY, HourlyFeeStrategy } from './domain/fee.strategy';
import {
  DEFAULT_PARKING_OPTIONS,
  PARKING_OPTIONS,
  type ParkingOptions,
} from './domain/parking-options';
import { PAYMENT_GATEWAY } from './domain/payment-gateway';
import {
  NearestFirstStrategy,
  SLOT_ALLOCATION_STRATEGY,
} from './domain/slot-allocation.strategy';
import { ParkingLotRepository } from './parking-lot.repository';
import { ParkingLotsController } from './parking-lots.controller';
import { ParkingService } from './parking.service';
import { FakePaymentGateway } from './payments/fake-payment-gateway';
import { SlotRepository } from './slot.repository';
import { TicketRepository } from './ticket.repository';
import { TicketsController } from './tickets.controller';

@Module({
  controllers: [ParkingLotsController, TicketsController],
  providers: [
    ParkingLotRepository,
    SlotRepository,
    TicketRepository,
    { provide: PARKING_OPTIONS, useValue: DEFAULT_PARKING_OPTIONS },
    // Swap a policy here; the service only knows the interfaces.
    { provide: SLOT_ALLOCATION_STRATEGY, useClass: NearestFirstStrategy },
    {
      provide: FEE_STRATEGY,
      useFactory: (o: ParkingOptions) => new HourlyFeeStrategy(o.hourlyRates),
      inject: [PARKING_OPTIONS],
    },
    { provide: PAYMENT_GATEWAY, useClass: FakePaymentGateway },
    ParkingService,
  ],
})
export class ParkingLotModule {}
