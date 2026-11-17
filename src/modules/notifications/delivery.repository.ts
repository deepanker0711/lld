import { Injectable } from '@nestjs/common';
import { InMemoryRepository } from '../../common/repository/in-memory.repository';
import { CreateInput } from '../../common/repository/repository.interface';
import { Delivery } from './entities/delivery.entity';

/**
 * Secondary index notificationId → deliveries (same idea as JobRunRepository).
 * In SQL: deliveries(notification_id FK) with an index on notification_id.
 */
@Injectable()
export class DeliveryRepository extends InMemoryRepository<Delivery> {
  private readonly byNotification = new Map<string, Delivery[]>();

  constructor() {
    super('Delivery', 'dlv');
  }

  override create(data: CreateInput<Delivery>): Delivery {
    const delivery = super.create(data);
    const list = this.byNotification.get(delivery.notificationId) ?? [];
    list.push(delivery);
    this.byNotification.set(delivery.notificationId, list);
    return delivery;
  }

  findByNotification(notificationId: string): Delivery[] {
    return [...(this.byNotification.get(notificationId) ?? [])];
  }
}
