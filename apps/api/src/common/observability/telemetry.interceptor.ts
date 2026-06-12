/**
 * Per-operation telemetry (T110 — CHK004). One span + one metric point + one structured log line
 * for every top-level GraphQL operation, all carrying the same attribute keys (telemetry.ts) so
 * traces, metrics, and logs correlate. Field resolvers are not intercepted (top-level only) —
 * per-field tracing belongs to an SDK auto-instrumentation, not this seam.
 */
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { GqlContextType, GqlExecutionContext } from '@nestjs/graphql';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import type { GraphQLResolveInfo } from 'graphql';
import { Observable, catchError, tap, throwError } from 'rxjs';
import type { GraphQLContext } from '../graphql/graphql-context';
import { ATTR, graphqlOperationCounter, graphqlOperationDuration, tracer } from './telemetry';

@Injectable()
export class TelemetryInterceptor implements NestInterceptor {
  constructor(@InjectPinoLogger('graphql') private readonly logger: PinoLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType<GqlContextType>() !== 'graphql') return next.handle();

    const gql = GqlExecutionContext.create(context);
    const info = gql.getInfo<GraphQLResolveInfo | undefined>();
    if (!info || (info.parentType.name !== 'Query' && info.parentType.name !== 'Mutation')) {
      return next.handle();
    }

    const operationType = info.parentType.name.toLowerCase();
    const field = info.fieldName;
    const tenantId = gql.getContext<GraphQLContext>().principal?.tenantId ?? 'anonymous';
    const startedAt = Date.now();
    const span = tracer().startSpan(`graphql.${operationType} ${field}`, {
      kind: SpanKind.SERVER,
      attributes: { [ATTR.operationType]: operationType, [ATTR.field]: field, [ATTR.tenantId]: tenantId },
    });

    const finish = (outcome: 'ok' | 'error', error?: unknown): void => {
      const durationMs = Date.now() - startedAt;
      const attributes = {
        [ATTR.operationType]: operationType,
        [ATTR.field]: field,
        [ATTR.outcome]: outcome,
      };
      graphqlOperationCounter().add(1, attributes);
      graphqlOperationDuration().record(durationMs, attributes);
      if (outcome === 'error') {
        span.setStatus({ code: SpanStatusCode.ERROR });
        if (error instanceof Error) span.recordException(error);
      }
      span.end();
      this.logger.info(
        { operationType, field, tenantId, durationMs, outcome },
        'graphql operation completed',
      );
    };

    return next.handle().pipe(
      tap(() => finish('ok')),
      catchError((error: unknown) => {
        finish('error', error);
        return throwError(() => error);
      }),
    );
  }
}
