import { BaseEntity } from '../entities/base.entity';
import { NotFoundError } from '../errors/domain.errors';
import { generateId } from '../utils/id.generator';
import { CreateInput, IRepository, UpdateInput } from './repository.interface';

/**
 * Generic Map-backed repository. Extend it once per entity:
 *
 *   @Injectable()
 *   export class SlotRepository extends InMemoryRepository<Slot> {
 *     constructor() { super('Slot', 'slot'); }
 *     findFreeByType(type: VehicleType) { return this.findAll(s => s.type === type && !s.occupied); }
 *   }
 *
 * Map keeps insertion order, so findAll() returns items in creation order.
 * Node is single-threaded: each method here runs without interruption. Races only
 * happen across `await` points in services, which is what KeyedMutex is for.
 */
export class InMemoryRepository<T extends BaseEntity> implements IRepository<T> {
  protected readonly store = new Map<string, T>();

  constructor(
    protected readonly entityName: string,
    protected readonly idPrefix?: string,
  ) {}

  create(data: CreateInput<T>): T {
    const now = new Date();
    const entity = {
      ...data,
      id: data.id ?? generateId(this.idPrefix),
      createdAt: now,
      updatedAt: now,
    } as T;
    this.store.set(entity.id, entity);
    return entity;
  }

  findById(id: string): T | undefined {
    return this.store.get(id);
  }

  findByIdOrThrow(id: string): T {
    const entity = this.store.get(id);
    if (!entity) throw new NotFoundError(this.entityName, id);
    return entity;
  }

  findAll(predicate?: (item: T) => boolean): T[] {
    const all = [...this.store.values()];
    return predicate ? all.filter(predicate) : all;
  }

  findOne(predicate: (item: T) => boolean): T | undefined {
    for (const item of this.store.values()) if (predicate(item)) return item;
    return undefined;
  }

  update(id: string, patch: UpdateInput<T>): T {
    const entity = this.findByIdOrThrow(id);
    // Mutate in place so other references to the same object stay in sync.
    Object.assign(entity, patch, { updatedAt: new Date() });
    return entity;
  }

  delete(id: string): boolean {
    return this.store.delete(id);
  }

  count(predicate?: (item: T) => boolean): number {
    return predicate ? this.findAll(predicate).length : this.store.size;
  }

  exists(id: string): boolean {
    return this.store.has(id);
  }

  clear(): void {
    this.store.clear();
  }
}
