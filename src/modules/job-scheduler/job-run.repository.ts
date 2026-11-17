import { Injectable } from '@nestjs/common';
import { InMemoryRepository } from '../../common/repository/in-memory.repository';
import { CreateInput } from '../../common/repository/repository.interface';
import { JobRun } from './entities/job-run.entity';

/**
 * Secondary index jobId → runs, so "history of job X" doesn't scan every run ever made.
 * In SQL: job_runs(job_id FK) with an index on (job_id, started_at).
 */
@Injectable()
export class JobRunRepository extends InMemoryRepository<JobRun> {
  private readonly byJob = new Map<string, JobRun[]>();

  constructor() {
    super('Job run', 'run');
  }

  override create(data: CreateInput<JobRun>): JobRun {
    const run = super.create(data);
    const list = this.byJob.get(run.jobId) ?? [];
    list.push(run);
    this.byJob.set(run.jobId, list);
    return run;
  }

  /** Oldest first. */
  findByJob(jobId: string): JobRun[] {
    return [...(this.byJob.get(jobId) ?? [])];
  }
}
