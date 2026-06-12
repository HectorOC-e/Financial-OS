import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TelemetryInterceptor } from './telemetry.interceptor';

/**
 * Observability seam (T110 — CHK004): OpenTelemetry spans + metrics and correlated structured logs
 * for every top-level GraphQL operation. API-only — a deployment registers the OTel SDK/exporter;
 * without one, all signals are silent no-ops and only the structured logs remain.
 */
@Global()
@Module({
  providers: [{ provide: APP_INTERCEPTOR, useClass: TelemetryInterceptor }],
})
export class ObservabilityModule {}
