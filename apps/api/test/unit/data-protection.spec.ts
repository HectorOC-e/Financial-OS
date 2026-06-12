/**
 * Data-protection posture (T112 — CHK026). Production must request DB TLS; redaction paths must
 * cover the financial/PII fields and secrets that could ride along on logged objects.
 */
import {
  PII_LOG_REDACTION_PATHS,
  assertDataProtectionPosture,
} from '../../src/common/config/data-protection';

describe('data protection (T112)', () => {
  it('accepts a TLS-required connection string in production', () => {
    const posture = assertDataProtectionPosture({
      DATABASE_URL: 'postgresql://u:p@db:5432/app?sslmode=require',
      NODE_ENV: 'production',
    });
    expect(posture.databaseTls).toBe(true);
  });

  it('rejects production startup without DB TLS', () => {
    expect(() =>
      assertDataProtectionPosture({
        DATABASE_URL: 'postgresql://u:p@db:5432/app',
        NODE_ENV: 'production',
      }),
    ).toThrow(/sslmode/);
  });

  it('allows plaintext locally (development/test)', () => {
    const posture = assertDataProtectionPosture({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/app',
      NODE_ENV: 'development',
    });
    expect(posture.databaseTls).toBe(false);
  });

  it('redacts authorization headers, financial amounts, and secrets', () => {
    for (const expected of ['req.headers.authorization', '*.amountCents', '*.declaredIncomeCents', '*.apiKey']) {
      expect(PII_LOG_REDACTION_PATHS).toContain(expected);
    }
  });
});
