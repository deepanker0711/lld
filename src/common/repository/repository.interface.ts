import { BaseEntity } from '../entities/base.entity';

/** Fields the repository fills in itself; callers never pass them. */
export type CreateInput<T extends BaseEntity> = Omit<T, 'id' | 'createdAt' | 'updatedAt'> &
  Partial<Pick<T, 'id'>>;

export type UpdateInput<T extends BaseEntity> = Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>;

/**
 * Storage abstraction. Services depend on this, not on a Map or a DB.
 * Interview answer to "how would you add Postgres?": write a TypeOrmRepository<T>
 * that implements this interface and change one provider binding.
 */
export interface IRepository<T extends BaseEntity> {
  create(data: CreateInput<T>): T;
  findById(id: string): T | undefined;
  findByIdOrThrow(id: string): T;
  findAll(predicate?: (item: T) => boolean): T[];
  findOne(predicate: (item: T) => boolean): T | undefined;
  update(id: string, patch: UpdateInput<T>): T;
  delete(id: string): boolean;
  count(predicate?: (item: T) => boolean): number;
  exists(id: string): boolean;
}
