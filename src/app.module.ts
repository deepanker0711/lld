import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { HealthController } from './health/health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { CartCheckoutModule } from './modules/cart-checkout/cart-checkout.module';
import { FoodDeliveryModule } from './modules/food-delivery/food-delivery.module';
import { LoggingFrameworkModule } from './modules/logging-framework/logging-framework.module';
import { MovieBookingModule } from './modules/movie-booking/movie-booking.module';
import { SplitwiseModule } from './modules/splitwise/splitwise.module';
import { WalletModule } from './modules/wallet/wallet.module';
// import { JobSchedulerModule } from './modules/job-scheduler/job-scheduler.module';
// import { LeaveManagementModule } from './modules/leave-management/leave-management.module';
// import { ParkingLotModule } from './modules/parking-lot/parking-lot.module';
// import { NotificationsModule } from './modules/notifications/notifications.module';
// import { LruCacheModule } from './modules/lru-cache/lru-cache.module';
// import { RateLimiterModule } from './modules/rate-limiter/rate-limiter.module';
// import { UrlRedirectModule, UrlShortenerModule } from './modules/url-shortener/url-shortener.module';

@Module({
  imports: [
    CommonModule, // keep: provides Clock, SequenceGenerator, KeyedMutex to every module
    // LruCacheModule,
    // UrlShortenerModule,
    // RateLimiterModule,
    // JobSchedulerModule,
    // NotificationsModule,
    // ParkingLotModule,
    // LeaveManagementModule,
    AuthModule,
    CartCheckoutModule,
    MovieBookingModule,
    WalletModule,
    SplitwiseModule,
    FoodDeliveryModule,
    LoggingFrameworkModule,
    // Add each new LLD module above this line.
    // UrlRedirectModule, // must stay last: GET /:code matches any single path segment
  ],
  controllers: [HealthController],
})
export class AppModule {}
