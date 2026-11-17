import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateJobDto } from './dto/create-job.dto';
import { ListJobsQuery } from './dto/list-jobs.query';
import { JobsService } from './jobs.service';

@ApiTags('Job Scheduler')
@Controller('jobs')
export class JobsController {
  constructor(private readonly service: JobsService) {}

  @Post()
  create(@Body() dto: CreateJobDto) {
    return this.service.create(dto);
  }

  @Get()
  list(@Query() query: ListJobsQuery) {
    return this.service.list(query.status);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.getWithRuns(id);
  }

  /** An action, not a resource update, so POST .../cancel. 200 because nothing is created. */
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }
}

@ApiTags('Job Scheduler')
@Controller('scheduler')
export class SchedulerController {
  constructor(private readonly service: JobsService) {}

  @Get('stats')
  stats() {
    return this.service.stats();
  }
}
