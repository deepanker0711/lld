/**
 * Every stored entity has these fields. Domain entities extend this:
 *   export class Slot extends BaseEntity { floor: number; ... }
 */
export abstract class BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}
