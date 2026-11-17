import { Injectable } from '@nestjs/common';
import { InMemoryRepository } from '../../common/repository/in-memory.repository';
import { Notification } from './entities/notification.entity';

@Injectable()
export class NotificationRepository extends InMemoryRepository<Notification> {
  constructor() {
    super('Notification', 'ntf');
  }

  /** Newest first. A scan here; in SQL an index on (user_id, created_at DESC). */
  findByUser(userId: string): Notification[] {
    return this.findAll((n) => n.userId === userId).reverse();
  }
}
