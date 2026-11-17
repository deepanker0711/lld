import { Injectable } from '@nestjs/common';
import { Job } from './entities/job.entity';
import { InMemoryRepository } from '../../common';

@Injectable()
export class JobRepository extends InMemoryRepository<Job> {
  constructor() {
    super('Job', 'job');
  }
}
