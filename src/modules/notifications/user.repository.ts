import { Injectable } from '@nestjs/common';
import { InMemoryRepository } from '../../common/repository/in-memory.repository';
import { User } from './entities/user.entity';

@Injectable()
export class UserRepository extends InMemoryRepository<User> {
  constructor() {
    super('User', 'usr');
  }
}
