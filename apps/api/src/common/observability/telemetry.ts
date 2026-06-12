/**
 * OpenTelemetry signal definitions (T110 — design-gate CHK004).
 *
 * Uses only `@opentelemetry/api`: with no SDK registered every call is a safe no-op; a deployment
 * wires a real SDK/exporter (OTLP collector, etc.) in main.ts without touching this code. Naming
 * follows OTel semantic conventions where they exist.
 *
 * Signals:
 *  - trace spans per GraphQL operation (`graphql.operation`), with type/field/outcome attributes;
 *  - `graphql.server.operations` counter and `graphql.server.duration` histogram (ms);
 *  - structured-log fields (one line per operation) carrying the same attributes, so logs and
 *    metrics/traces correlate on identical keys.
 */
import { Counter, Histogram, Meter, Tracer, metrics, trace } from '@opentelemetry/api';

export const INSTRUMENTATION_SCOPE = 'financial-os-api';

export function tracer(): Tracer {
  return trace.getTracer(INSTRUMENTATION_SCOPE);
}

export function meter(): Meter {
  return metrics.getMeter(INSTRUMENTATION_SCOPE);
}

/** Attribute keys shared by spans, metrics, and structured logs. */
export const ATTR = {
  operationType: 'graphql.operation.type', // query | mutation | subscription
  field: 'graphql.operation.name', // top-level field, e.g. recordContribution
  outcome: 'graphql.operation.outcome', // ok | error
  tenantId: 'tenant.id',
} as const;

let operationCounter: Counter | undefined;
let operationDuration: Histogram | undefined;

export function graphqlOperationCounter(): Counter {
  operationCounter ??= meter().createCounter('graphql.server.operations', {
    description: 'Completed top-level GraphQL operations',
  });
  return operationCounter;
}

export function graphqlOperationDuration(): Histogram {
  operationDuration ??= meter().createHistogram('graphql.server.duration', {
    description: 'Top-level GraphQL operation duration',
    unit: 'ms',
  });
  return operationDuration;
}
