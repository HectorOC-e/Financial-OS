/**
 * Optimistic-concurrency helper (FR-006a / R12).
 *
 * Mutable shared records carry an integer `version`. A mutation supplies the `expectedVersion`
 * it read; the repository performs a conditional update (`WHERE id = ? AND version = expected`)
 * that also increments the version. If zero rows are affected the version was stale and we
 * return a CONFLICT domain error — never a silent lost update.
 *
 * The core is decoupled from Prisma so it is unit-testable without a database: callers pass a
 * `conditionalUpdate` function that performs the guarded write and returns the affected-row
 * count. A thin Prisma adapter (`prismaVersionedUpdate`) is provided for real repositories.
 */
import { DomainError, Result, ok, err } from '../errors';

export interface OptimisticUpdateParams<T> {
  /** Version the caller read and expects to still be current. */
  expectedVersion: number;
  /**
   * Performs the guarded `UPDATE ... WHERE version = expectedVersion SET version = version + 1`
   * and resolves to the number of affected rows (0 ⇒ stale version).
   */
  conditionalUpdate: (expectedVersion: number) => Promise<number>;
  /** Optional reload of the freshly-updated aggregate to return on success. */
  reload?: () => Promise<T>;
  /** Optional override for the conflict message/details. */
  onConflict?: () => DomainError;
}

export async function updateWithOptimisticLock<T>(
  params: OptimisticUpdateParams<T>,
): Promise<Result<T | undefined>> {
  const affected = await params.conditionalUpdate(params.expectedVersion);
  if (affected === 0) {
    return err(
      params.onConflict
        ? params.onConflict()
        : DomainError.conflict('The record was modified by another operation', {
            expectedVersion: params.expectedVersion,
          }),
    );
  }
  const value = params.reload ? await params.reload() : undefined;
  return ok(value);
}

/**
 * Prisma delegate shape needed for a versioned conditional update. Prisma's `updateMany`
 * returns `{ count }`; using it lets us add `version` to the WHERE clause (unlike `update`,
 * which keys on a unique field only).
 */
export interface VersionedDelegate {
  updateMany(args: {
    where: Record<string, unknown> & { version: number };
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
}

/**
 * Builds a `conditionalUpdate` for a Prisma model: guards on `id + version` and bumps the
 * version atomically. `data` should NOT set `version` — it is incremented here.
 */
export function prismaVersionedUpdate(
  delegate: VersionedDelegate,
  where: Record<string, unknown>,
  data: Record<string, unknown>,
): (expectedVersion: number) => Promise<number> {
  return async (expectedVersion: number) => {
    const result = await delegate.updateMany({
      where: { ...where, version: expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    return result.count;
  };
}
