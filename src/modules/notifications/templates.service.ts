import { Injectable } from '@nestjs/common';
import {
  ConflictError,
  NotFoundError,
} from '../../common/errors/domain.errors';
import { NotificationChannel } from './domain/notification-channel';
import { extractVariables } from './domain/template-renderer';
import { CreateTemplateDto } from './dto/create-template.dto';
import { Template, templateId } from './entities/template.entity';
import { TemplateRepository } from './template.repository';

@Injectable()
export class TemplatesService {
  constructor(private readonly templates: TemplateRepository) {}

  create(dto: CreateTemplateDto): Template {
    const channel = dto.channel ?? null;
    const id = templateId(dto.key, channel);
    if (this.templates.exists(id)) {
      throw new ConflictError(
        `Template '${dto.key}' already has a ${channel ?? 'default'} variant`,
      );
    }
    const subject = dto.subject ?? null;
    return this.templates.create({
      id,
      key: dto.key,
      channel,
      subject,
      body: dto.body,
      variables: extractVariables(subject ?? '', dto.body),
    });
  }

  list(): Template[] {
    return this.templates.findAll();
  }

  /** All variants of one key. 404 if the key has none. */
  getByKey(key: string): Template[] {
    const variants = this.templates.findByKey(key);
    if (variants.length === 0) throw new NotFoundError('Template', key);
    return variants;
  }

  /** The template a channel will use: its own variant, else the default, else undefined. */
  resolve(key: string, channel: NotificationChannel): Template | undefined {
    return (
      this.templates.findVariant(key, channel) ??
      this.templates.findVariant(key, null)
    );
  }
}
