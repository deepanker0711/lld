import { Injectable } from '@nestjs/common';
import { InMemoryRepository } from '../../common/repository/in-memory.repository';
import { Job } from './entities/job.entity';

@Injectable()
export class JobRepository extends InMemoryRepository<Job> {
  constructor() {
    super('Job', 'job');
  }
}
