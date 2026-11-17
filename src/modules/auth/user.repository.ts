import { Injectable } from '@nestjs/common';
import { InMemoryRepository } from '../../common/repository/in-memory.repository';
import { CreateInput } from '../../common/repository/repository.interface';
import { User } from './entities/user.entity';

@Injectable()
export class UserRepository extends InMemoryRepository<User> {
  private readonly byEmail = new Map<string, string>();

  constructor() {
    super('User', 'usr');
  }

  override create(data: CreateInput<User>): User {
    const user = super.create(data);
    this.byEmail.set(user.email, user.id);
    return user;
  }

  findByEmail(email: string): User | undefined {
    const id = this.byEmail.get(email);
    return id ? this.findById(id) : undefined;
  }
}
