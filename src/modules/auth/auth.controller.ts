import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { type AuthContext, AuthService } from './auth.service';
import { Role } from './domain/role';
import { LoginDto, RefreshDto, RegisterDto } from './dto/auth.dto';
import { AccessTokenGuard } from './guards/access-token.guard';
import { CurrentAuth, Roles } from './guards/auth.decorators';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, { userAgent: req.header('user-agent'), ip: req.ip });
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  logout(@CurrentAuth() auth: AuthContext) {
    this.auth.logout(auth);
    return { loggedOut: true };
  }

  @Post('logout-all')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  logoutAll(@CurrentAuth() auth: AuthContext) {
    return this.auth.logoutAll(auth);
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  me(@CurrentAuth() auth: AuthContext) {
    return this.auth.me(auth);
  }

  @Get('sessions')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  sessions(@CurrentAuth() auth: AuthContext) {
    return this.auth.listSessions(auth);
  }

  @Delete('sessions/:id')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  revokeSession(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    this.auth.revokeSession(auth, id);
    return { revoked: true };
  }

  @Get('admin/users')
  @UseGuards(AccessTokenGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  users() {
    return this.auth.listUsers();
  }

  @Post('admin/users/:id/unlock')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  unlock(@Param('id') id: string) {
    return this.auth.unlock(id);
  }
}
