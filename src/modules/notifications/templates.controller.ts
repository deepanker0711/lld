import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateTemplateDto } from './dto/create-template.dto';
import { TemplatesService } from './templates.service';

@ApiTags('Notifications')
@Controller('templates')
export class TemplatesController {
  constructor(private readonly service: TemplatesService) {}

  @Post()
  create(@Body() dto: CreateTemplateDto) {
    return this.service.create(dto);
  }

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':key')
  getByKey(@Param('key') key: string) {
    return this.service.getByKey(key);
  }
}
