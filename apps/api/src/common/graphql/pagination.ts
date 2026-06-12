/**
 * Cursor pagination for unbounded list fields (T107 — design-gate CHK017).
 *
 * Forward-only, opaque-cursor pagination on `members`, `contributionRecords`, and `sharedGoals`.
 * The cursor is the base64url-encoded id of the last item of the previous page — clients must treat
 * it as opaque. `first` is clamped to [1, MAX_PAGE_SIZE]; omitted/null means DEFAULT_PAGE_SIZE, so
 * every list field is bounded even when callers pass nothing.
 *
 * Two application styles:
 *  - `pageSlice` for lists already assembled in memory (small, e.g. members ≤ ~20 per profile);
 *  - `prismaPage` for repository-level pagination of genuinely unbounded tables (records, goals).
 */
import { ArgsType, Field, Int } from '@nestjs/graphql';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

@ArgsType()
export class PageArgs {
  @Field(() => Int, { nullable: true, description: `Page size; clamped to [1, ${MAX_PAGE_SIZE}]. Defaults to ${DEFAULT_PAGE_SIZE}.` })
  first?: number | null;

  @Field(() => String, { nullable: true, description: 'Opaque cursor: return items strictly after this one.' })
  after?: string | null;
}

export function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

/** Returns null for absent/malformed cursors — a bad cursor reads as "from the start". */
export function decodeCursor(cursor: string | null | undefined): string | null {
  if (!cursor) return null;
  try {
    const id = Buffer.from(cursor, 'base64url').toString('utf8');
    return id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

export function clampPageSize(first: number | null | undefined): number {
  if (first == null || !Number.isInteger(first) || first < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(first, MAX_PAGE_SIZE);
}

/** Cursor-paginate an already-loaded list (stable input order; cursor = last item's id). */
export function pageSlice<T extends { id: string }>(items: readonly T[], args: PageArgs): T[] {
  const afterId = decodeCursor(args.after);
  const start = afterId ? items.findIndex((i) => i.id === afterId) + 1 : 0;
  return items.slice(start, start + clampPageSize(args.first));
}

/**
 * Prisma `findMany` arguments for DB-level cursor pagination. The caller must pair this with a
 * deterministic `orderBy` that ends on the unique cursor column (id).
 */
export function prismaPage(args: PageArgs): { take: number; skip?: number; cursor?: { id: string } } {
  const afterId = decodeCursor(args.after);
  const take = clampPageSize(args.first);
  return afterId ? { take, skip: 1, cursor: { id: afterId } } : { take };
}
