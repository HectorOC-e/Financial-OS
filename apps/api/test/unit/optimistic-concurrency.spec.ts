import {
  updateWithOptimisticLock,
  prismaVersionedUpdate,
  VersionedDelegate,
} from '../../src/common/persistence/versioned-repository';
import { DomainErrorCode } from '../../src/common/errors';

describe('updateWithOptimisticLock (FR-006a)', () => {
  it('succeeds when the conditional update affects a row', async () => {
    const result = await updateWithOptimisticLock({
      expectedVersion: 3,
      conditionalUpdate: async () => 1,
      reload: async () => ({ id: 'm1', version: 4 }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ id: 'm1', version: 4 });
    }
  });

  it('returns CONFLICT when zero rows are affected (stale version)', async () => {
    const result = await updateWithOptimisticLock({
      expectedVersion: 2,
      conditionalUpdate: async () => 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DomainErrorCode.CONFLICT);
      expect(result.error.details).toMatchObject({ expectedVersion: 2 });
    }
  });

  it('passes the expectedVersion through to the conditional update', async () => {
    const seen: number[] = [];
    await updateWithOptimisticLock({
      expectedVersion: 7,
      conditionalUpdate: async (v) => {
        seen.push(v);
        return 1;
      },
    });
    expect(seen).toEqual([7]);
  });
});

describe('prismaVersionedUpdate', () => {
  it('guards on id + version and increments version atomically', async () => {
    const calls: unknown[] = [];
    const delegate: VersionedDelegate = {
      updateMany: async (args) => {
        calls.push(args);
        return { count: args.where.version === 5 ? 1 : 0 };
      },
    };

    const run = prismaVersionedUpdate(delegate, { id: 'm1' }, { role: 'ADMIN' });

    expect(await run(5)).toBe(1);
    expect(await run(4)).toBe(0);
    expect(calls[0]).toEqual({
      where: { id: 'm1', version: 5 },
      data: { role: 'ADMIN', version: { increment: 1 } },
    });
  });
});
