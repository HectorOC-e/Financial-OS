/**
 * Error-catalog completeness (T108 — CHK016). Every DomainErrorCode must be documented in the
 * catalog with stable client-facing semantics, and the catalog must never carry duplicate codes.
 */
import { DomainErrorCode } from '../../src/common/errors/domain-error';
import { ERROR_CATALOG, TransportErrorCode, catalogEntry } from '../../src/common/errors/catalog';

describe('error catalog (T108)', () => {
  it('documents every DomainErrorCode', () => {
    for (const code of Object.values(DomainErrorCode)) {
      expect(catalogEntry(code)).toBeDefined();
    }
  });

  it('documents every TransportErrorCode', () => {
    for (const code of Object.values(TransportErrorCode)) {
      expect(catalogEntry(code)).toBeDefined();
    }
  });

  it('has no duplicate codes', () => {
    const codes = ERROR_CATALOG.map((e) => e.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('marks CONFLICT retryable (refetch + retry with fresh version) and FORBIDDEN not', () => {
    expect(catalogEntry(DomainErrorCode.CONFLICT)?.retryable).toBe(true);
    expect(catalogEntry(DomainErrorCode.FORBIDDEN)?.retryable).toBe(false);
  });

  it('every entry carries an HTTP analogue and non-empty guidance', () => {
    for (const entry of ERROR_CATALOG) {
      expect(entry.httpAnalogue).toBeGreaterThanOrEqual(400);
      expect(entry.when.length).toBeGreaterThan(0);
      expect(entry.clientAction.length).toBeGreaterThan(0);
    }
  });
});
