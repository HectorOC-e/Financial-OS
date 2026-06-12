/**
 * Cursor-pagination helper invariants (T107 — CHK017). Deterministic, framework-free: clamping,
 * opaque-cursor round-trips, in-memory slicing, and Prisma argument shaping.
 */
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  clampPageSize,
  decodeCursor,
  encodeCursor,
  pageSlice,
  prismaPage,
} from '../../src/common/graphql/pagination';

describe('pagination (T107)', () => {
  describe('clampPageSize', () => {
    it('defaults when first is absent', () => {
      expect(clampPageSize(null)).toBe(DEFAULT_PAGE_SIZE);
      expect(clampPageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
    });

    it('clamps to the maximum', () => {
      expect(clampPageSize(10_000)).toBe(MAX_PAGE_SIZE);
    });

    it('rejects non-positive and non-integer sizes back to the default', () => {
      expect(clampPageSize(0)).toBe(DEFAULT_PAGE_SIZE);
      expect(clampPageSize(-5)).toBe(DEFAULT_PAGE_SIZE);
      expect(clampPageSize(2.5)).toBe(DEFAULT_PAGE_SIZE);
    });

    it('passes through valid sizes', () => {
      expect(clampPageSize(1)).toBe(1);
      expect(clampPageSize(MAX_PAGE_SIZE)).toBe(MAX_PAGE_SIZE);
    });
  });

  describe('cursor round-trip', () => {
    it('encodes and decodes ids losslessly', () => {
      const id = 'a3f1c9e2-0000-4000-8000-1234567890ab';
      expect(decodeCursor(encodeCursor(id))).toBe(id);
    });

    it('treats absent or malformed cursors as "from the start"', () => {
      expect(decodeCursor(null)).toBeNull();
      expect(decodeCursor(undefined)).toBeNull();
      expect(decodeCursor('')).toBeNull();
    });
  });

  describe('pageSlice', () => {
    const items = Array.from({ length: 7 }, (_, i) => ({ id: `id-${i}` }));

    it('returns the first page without a cursor', () => {
      expect(pageSlice(items, { first: 3 }).map((i) => i.id)).toEqual(['id-0', 'id-1', 'id-2']);
    });

    it('continues strictly after the cursor', () => {
      const page1 = pageSlice(items, { first: 3 });
      const cursor = encodeCursor(page1[page1.length - 1].id);
      expect(pageSlice(items, { first: 3, after: cursor }).map((i) => i.id)).toEqual(['id-3', 'id-4', 'id-5']);
    });

    it('walks the full list without duplicates or gaps', () => {
      const seen: string[] = [];
      let after: string | null = null;
      for (;;) {
        const page = pageSlice(items, { first: 2, after });
        if (page.length === 0) break;
        seen.push(...page.map((i) => i.id));
        after = encodeCursor(page[page.length - 1].id);
      }
      expect(seen).toEqual(items.map((i) => i.id));
    });

    it('is bounded even with no arguments', () => {
      const many = Array.from({ length: 500 }, (_, i) => ({ id: `m-${String(i).padStart(3, '0')}` }));
      expect(pageSlice(many, {}).length).toBe(DEFAULT_PAGE_SIZE);
    });

    it('an unknown cursor reads from the start (stale cursors degrade safely)', () => {
      expect(pageSlice(items, { first: 2, after: encodeCursor('missing') })[0].id).toBe('id-0');
    });
  });

  describe('prismaPage', () => {
    it('emits take-only for the first page', () => {
      expect(prismaPage({ first: 10 })).toEqual({ take: 10 });
    });

    it('emits cursor + skip for subsequent pages', () => {
      expect(prismaPage({ first: 10, after: encodeCursor('row-1') })).toEqual({
        take: 10,
        skip: 1,
        cursor: { id: 'row-1' },
      });
    });

    it('is bounded with no arguments', () => {
      expect(prismaPage({})).toEqual({ take: DEFAULT_PAGE_SIZE });
    });
  });
});
