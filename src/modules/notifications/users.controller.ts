import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { NotificationsService } from './notifications.service';
import { UsersService } from './users.service';

@ApiTags('Notifications')
@Controller('users')
export class UsersController {
  constructor(
    private readonly service: UsersService,
    private readonly notifications: NotificationsService,
  ) {}

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.service.create(dto);
  }

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Put(':id/preferences')
  updatePreferences(
    @Param('id') id: string,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.service.updatePreferences(id, dto);
  }

  /** ?page=1&limit=20, newest first. */
  @Get(':id/notifications')
  listNotifications(@Param('id') id: string, @Query() query: PaginationDto) {
    return this.notifications.listForUser(id, query);
  }
}
