import { Module } from '@nestjs/common';
import { JOB_HANDLERS, type JobHandler } from './domain/job-handler';
import {
  DEFAULT_SCHEDULER_OPTIONS,
  SCHEDULER_OPTIONS,
} from './domain/scheduler-options';
import { HandlerRegistry } from './handler-registry.service';
import { HANDLER_CLASSES } from './handlers';
import { JobRunRepository } from './job-run.repository';
import { JobRepository } from './job.repository';
import { JobScheduler } from './job-scheduler.service';
import { JobsController, SchedulerController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  controllers: [JobsController, SchedulerController],
  providers: [
    ...HANDLER_CLASSES,
    // Collect every handler instance into one array under a single token.
    {
      provide: JOB_HANDLERS,
      useFactory: (...handlers: JobHandler[]) => handlers,
      inject: HANDLER_CLASSES,
    },
    HandlerRegistry,
    JobRepository,
    JobRunRepository,
    { provide: SCHEDULER_OPTIONS, useValue: DEFAULT_SCHEDULER_OPTIONS },
    JobScheduler,
    JobsService,
  ],
  exports: [HandlerRegistry],
})
export class JobSchedulerModule {}
