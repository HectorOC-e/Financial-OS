import DataLoader from 'dataloader';

/**
 * Per-request DataLoader factory (R8) to batch/dedupe GraphQL field resolution and kill N+1.
 * A fresh set of loaders is created per request (see GraphQL context, T029) so cached entities
 * never leak across requests/tenants.
 */
export type BatchFn<K, V> = (keys: readonly K[]) => Promise<(V | Error)[]>;

export function createLoader<K, V>(batch: BatchFn<K, V>): DataLoader<K, V> {
  return new DataLoader<K, V>(batch, { cache: true });
}

/**
 * Helper to map a list of rows back to the requested key order (DataLoader contract: results must
 * align positionally with `keys`). Missing keys resolve to `null`.
 */
export function mapToKeys<K, V>(
  keys: readonly K[],
  rows: V[],
  keyOf: (row: V) => K,
): (V | null)[] {
  const byKey = new Map<K, V>();
  for (const row of rows) {
    byKey.set(keyOf(row), row);
  }
  return keys.map((k) => byKey.get(k) ?? null);
}
