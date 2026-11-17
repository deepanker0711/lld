import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

/** Shared by main.ts and e2e tests so both run the exact same pipeline. */
export function configureApp(app: INestApplication, { logRequests = true } = {}): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties without decorators
      forbidNonWhitelisted: true, // ...and reject the request if any were sent
      transform: true, // payload -> DTO class instance, '5' -> 5 for typed params
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(
    ...(logRequests ? [new LoggingInterceptor()] : []),
    new ResponseInterceptor(),
  );
  app.enableShutdownHooks();
}
