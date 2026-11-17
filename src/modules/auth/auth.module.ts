import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AUTH_OPTIONS, type AuthOptions, authOptionsFromEnv } from './domain/auth-options';
import { PASSWORD_HASHER, ScryptPasswordHasher } from './domain/password-hasher';
import { AccessTokenGuard } from './guards/access-token.guard';
import { SessionRepository } from './session.repository';
import { UserRepository } from './user.repository';

@Module({
  controllers: [AuthController],
  providers: [
    UserRepository,
    SessionRepository,
    { provide: AUTH_OPTIONS, useFactory: () => authOptionsFromEnv() },
    {
      provide: PASSWORD_HASHER,
      useFactory: (o: AuthOptions) => new ScryptPasswordHasher(o.scryptCost),
      inject: [AUTH_OPTIONS],
    },
    AuthService,
    AccessTokenGuard,
  ],
  // Other modules can protect their routes with @UseGuards(AccessTokenGuard).
  exports: [AuthService, AccessTokenGuard],
})
export class AuthModule {}
