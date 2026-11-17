import { BaseEntity } from '../../../common/entities/base.entity';

/**
 *   onHand = available + reserved
 * `reserved` holds units for checkouts whose payment is in flight, so two buyers
 * can't both pay for the last unit.
 */
export class Product extends BaseEntity {
  sku: string;
  name: string;
  pricePaise: number;
  available: number;
  reserved: number;
  active: boolean;
}
