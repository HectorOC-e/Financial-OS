/**
 * Integration test kit for US7 (T104/T105). Adds the read-only coaching services on top of the
 * accounts kit. The OpenRouter client is constructed with no API key, so it returns the deterministic
 * fallback insight (no network). Requires a live RLS-enabled PostgreSQL.
 */
import { CoachingReadService } from '../../../src/modules/ai-coaching/application/coaching-read.service';
import { OpenRouterClient } from '../../../src/modules/ai-coaching/infrastructure/openrouter.client';
import { AccountsTestKit } from './accounts-test-kit';

const noKeyConfig = { get: () => undefined } as never;
const noopLogger = { info() {}, warn() {}, error() {}, debug() {} } as never;

export class CoachingTestKit extends AccountsTestKit {
  readonly coachingRead = new CoachingReadService(this.tenancy, this.repo, this.periodService, this.analytics);
  readonly openRouter = new OpenRouterClient(noKeyConfig, noopLogger);
}
