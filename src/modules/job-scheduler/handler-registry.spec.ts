import { Test } from '@nestjs/testing';
import { CommonModule } from '../../common/common.module';
import { BadRequestError } from '../../common/errors/domain.errors';
import type { JobHandler } from './domain/job-handler';
import { HandlerRegistry } from './handler-registry.service';
import { JobSchedulerModule } from './job-scheduler.module';

const fakeHandler = (type: string): JobHandler => ({
  type,
  handle: async () => {},
});

describe('HandlerRegistry', () => {
  it('looks handlers up by type', () => {
    const email = fakeHandler('EMAIL');
    const registry = new HandlerRegistry([email, fakeHandler('REPORT')]);
    expect(registry.get('EMAIL')).toBe(email);
    expect(registry.has('REPORT')).toBe(true);
    expect(registry.types()).toEqual(['EMAIL', 'REPORT']);
  });

  it('throws BadRequestError listing known types for an unknown type', () => {
    const registry = new HandlerRegistry([fakeHandler('EMAIL')]);
    expect(registry.has('NOPE')).toBe(false);
    try {
      registry.get('NOPE');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
      expect((err as BadRequestError).details).toEqual({
        knownTypes: ['EMAIL'],
      });
    }
  });

  it('refuses two handlers for the same type', () => {
    expect(
      () => new HandlerRegistry([fakeHandler('X'), fakeHandler('X')]),
    ).toThrow(/Duplicate/);
  });

  it('is wired by JobSchedulerModule with all demo handlers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CommonModule, JobSchedulerModule],
    }).compile();
    const registry = moduleRef.get(HandlerRegistry);
    expect(registry.types().sort()).toEqual([
      'FAIL_ALWAYS',
      'FAIL_RANDOMLY',
      'GENERATE_REPORT',
      'SEND_EMAIL',
    ]);
  });
});
