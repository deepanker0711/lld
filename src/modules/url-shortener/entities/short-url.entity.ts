import { BaseEntity } from '../../../common/entities/base.entity';

/** id === code, so lookup by code is a direct Map get. */
export class ShortUrl extends BaseEntity {
  code: string;
  longUrl: string;
  isCustom: boolean;
  expiresAt: Date | null;
  clicks: number;
  lastAccessedAt: Date | null;
}
