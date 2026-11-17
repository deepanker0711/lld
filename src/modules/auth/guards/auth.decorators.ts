import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '../domain/role';
import type { AuthContext } from '../auth.service';

export const ROLES_KEY = 'auth:roles';

/** @Roles(Role.ADMIN) on a handler or controller; checked by AccessTokenGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export type AuthedRequest = Request & { auth?: AuthContext };

/** @CurrentAuth() auth: AuthContext — set by AccessTokenGuard. */
export const CurrentAuth = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext => {
    const auth = ctx.switchToHttp().getRequest<AuthedRequest>().auth;
    if (!auth) throw new Error('CurrentAuth used on a route without AccessTokenGuard');
    return auth;
  },
);
