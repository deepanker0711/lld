import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SendNotificationDto } from './dto/send-notification.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  /** 202 Accepted: stored and queued, not sent yet. Poll GET /notifications/:id for the outcome. */
  @Post()
  @HttpCode(202)
  send(@Body() dto: SendNotificationDto) {
    return this.service.send(dto);
  }

  /** The notification, its overall status, and every delivery's status/attempts/error. */
  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }
}
