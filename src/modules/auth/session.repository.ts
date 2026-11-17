import { Injectable } from '@nestjs/common';
import { InMemoryRepository } from '../../common/repository/in-memory.repository';
import { CreateInput, UpdateInput } from '../../common/repository/repository.interface';
import { Session } from './entities/session.entity';

/**
 * Two indexes:
 * - userId → session ids (the "my devices" list, logout-all)
 * - refresh-token hash → session id, for EVERY hash a session has ever had. Rotated
 *   hashes stay in the index on purpose: seeing one again is how reuse is detected.
 */
@Injectable()
export class SessionRepository extends InMemoryRepository<Session> {
  private readonly byUser = new Map<string, string[]>();
  private readonly byTokenHash = new Map<string, string>();

  constructor() {
    super('Session', 'ses');
  }

  override create(data: CreateInput<Session>): Session {
    const session = super.create(data);
    this.byUser.set(session.userId, [...(this.byUser.get(session.userId) ?? []), session.id]);
    this.byTokenHash.set(session.refreshTokenHash, session.id);
    return session;
  }

  override update(id: string, patch: UpdateInput<Session>): Session {
    const session = super.update(id, patch);
    if (patch.refreshTokenHash) this.byTokenHash.set(patch.refreshTokenHash, id);
    return session;
  }

  findByTokenHash(hash: string): Session | undefined {
    const id = this.byTokenHash.get(hash);
    return id ? this.findById(id) : undefined;
  }

  findByUser(userId: string): Session[] {
    return (this.byUser.get(userId) ?? []).map((id) => this.findByIdOrThrow(id));
  }
}
