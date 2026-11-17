import { Injectable } from '@nestjs/common';
import { InMemoryRepository } from '../../common/repository/in-memory.repository';
import { NotificationChannel } from './domain/notification-channel';
import { Template, templateId } from './entities/template.entity';

@Injectable()
export class TemplateRepository extends InMemoryRepository<Template> {
  constructor() {
    super('Template');
  }

  findVariant(
    key: string,
    channel: NotificationChannel | null,
  ): Template | undefined {
    return this.findById(templateId(key, channel));
  }

  /** Every variant of a key (default and per-channel). */
  findByKey(key: string): Template[] {
    return this.findAll((t) => t.key === key);
  }
}
