import { Module } from '@nestjs/common';
import { BookingService } from './booking.service';
import { MovieCatalogService } from './catalog.service';
import { BOOKING_OPTIONS, DEFAULT_BOOKING_OPTIONS } from './domain/booking-options';
import { PAYMENT_GATEWAY } from './domain/payment-gateway';
import { PRICING_STRATEGY, StandardPricing } from './domain/pricing.strategy';
import { MovieBookingController } from './movie-booking.controller';
import { FakePaymentGateway } from './payments/fake-payment-gateway';
import { BookingRepository, CinemaRepository, MovieRepository, ScreenRepository, ShowRepository } from './repositories';

@Module({
  controllers: [MovieBookingController],
  providers: [
    CinemaRepository,
    ScreenRepository,
    MovieRepository,
    ShowRepository,
    BookingRepository,
    { provide: BOOKING_OPTIONS, useValue: DEFAULT_BOOKING_OPTIONS },
    { provide: PRICING_STRATEGY, useValue: new StandardPricing() },
    { provide: PAYMENT_GATEWAY, useClass: FakePaymentGateway },
    MovieCatalogService,
    BookingService,
  ],
})
export class MovieBookingModule {}
