import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenError, UnauthorizedError } from '../../../common/errors/domain.errors';
import { AuthService } from '../auth.service';
import { Role } from '../domain/role';
import { type AuthedRequest, ROLES_KEY } from './auth.decorators';

/**
 * Authentication (401) then authorization (403), in that order.
 * Not global on purpose: the other LLD modules in this repo stay public.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedError('Missing Bearer token');
    }
    req.auth = this.auth.authenticate(token);

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required?.length && !required.some((r) => req.auth!.roles.includes(r))) {
      throw new ForbiddenError(`Requires role: ${required.join(' or ')}`);
    }
    return true;
  }
}
