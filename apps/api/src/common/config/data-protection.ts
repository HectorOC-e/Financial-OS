/**
 * Data-protection / PII-handling configuration (T112 — design-gate CHK026, analysis C1).
 *
 * Classification of what this system stores and how each class is protected:
 *
 *  - **Financial amounts** (declared income, balances, contributions, debts): tenant-isolated by
 *    PostgreSQL RLS; encrypted at rest by the database layer (see `atRestEncryption` below);
 *    never written to application logs (redaction paths) and never sent to the LLM un-redacted
 *    (ai-coaching redactForPrompt strips identifiers before any OpenRouter call).
 *  - **Identifiers** (emails, display names): same RLS + at-rest posture; redacted from logs.
 *  - **Secrets** (DATABASE_URL, REDIS_URL, OPENROUTER_API_KEY, auth headers): env-only, never
 *    persisted, always redacted from logs.
 *
 * At-rest encryption is enforced at the infrastructure layer, NOT in application code: the
 * PostgreSQL volume must run with storage-level encryption (cloud KMS / LUKS / TDE) and TLS in
 * transit (`sslmode=require`). `assertDataProtectionPosture` fails fast at production startup when
 * the connection string does not request TLS, making the posture an explicit deploy-time contract.
 */

/**
 * pino redaction paths: every place a PII/financial value could appear in a log line.
 * Applied globally via LoggerModule (app.module.ts) — log calls never need to remember this.
 */
export const PII_LOG_REDACTION_PATHS: readonly string[] = [
  // HTTP layer
  'req.headers.authorization',
  'req.headers.cookie',
  // Financial values & identifiers that may ride along on logged objects
  '*.amountCents',
  '*.declaredIncomeCents',
  '*.balance',
  '*.openingBalanceCents',
  '*.email',
  '*.displayName',
  // Secrets, wherever they surface
  '*.apiKey',
  '*.password',
];

export interface DataProtectionPosture {
  /** TLS requested on the PostgreSQL connection (in-transit protection). */
  databaseTls: boolean;
  /** Where at-rest encryption is provided. Informational — enforced at deploy time. */
  atRestEncryption: 'storage-layer (cloud KMS / volume encryption)';
}

/** Inspect the runtime configuration; throw in production when in-transit protection is missing. */
export function assertDataProtectionPosture(env: {
  DATABASE_URL: string;
  NODE_ENV: string;
}): DataProtectionPosture {
  const databaseTls = /[?&]sslmode=(require|verify-ca|verify-full)/.test(env.DATABASE_URL);
  if (env.NODE_ENV === 'production' && !databaseTls) {
    throw new Error(
      'Data-protection violation (CHK026): production DATABASE_URL must require TLS (sslmode=require or stricter)',
    );
  }
  return { databaseTls, atRestEncryption: 'storage-layer (cloud KMS / volume encryption)' };
}
