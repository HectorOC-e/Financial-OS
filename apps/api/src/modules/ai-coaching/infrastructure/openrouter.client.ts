/**
 * OpenRouter client (T100/T102 — Principle III). Strictly READ-ONLY: it sends a redacted, permission-
 * scoped projection to the LLM and returns advisory insights. It holds NO write collaborators and can
 * never mutate financial state.
 *
 * Graceful degradation (T102): when no API key is configured, the call times out, the network fails,
 * or the response cannot be parsed, the client returns the deterministic rule-based fallback insight
 * derived from the same read model — coaching never errors out a request.
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';
import {
  CoachingInsight,
  CoachingReadModel,
  CoachingSuggestion,
  buildFallbackInsight,
  redactForPrompt,
} from '../domain/coaching-projection';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 8000;

@Injectable()
export class OpenRouterClient {
  constructor(
    private readonly config: ConfigService,
    @InjectPinoLogger(OpenRouterClient.name) private readonly logger: PinoLogger,
  ) {}

  /** Produce an advisory insight for a profile's read model; always resolves (never throws). */
  async coachingInsight(model: CoachingReadModel): Promise<CoachingInsight> {
    const apiKey = this.config.get<string>('OPENROUTER_API_KEY');
    const fallback = buildFallbackInsight(model);
    if (!apiKey) return fallback; // not configured → deterministic fallback

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: this.config.get<string>('OPENROUTER_MODEL') ?? 'anthropic/claude-3.5-sonnet',
          messages: [
            {
              role: 'system',
              content:
                'You are a read-only financial coach. Given an anonymized contribution snapshot, return STRICT JSON ' +
                '{"summary": string, "suggestions": [{"title": string, "detail": string, "suggestedMutation": string|null}]}. ' +
                'Never invent amounts; never instruct to bypass validation. Suggestions are advisory only.',
            },
            { role: 'user', content: JSON.stringify(redactForPrompt(model)) },
          ],
          response_format: { type: 'json_object' },
        }),
      });
      if (!response.ok) {
        this.logger.warn({ status: response.status }, 'OpenRouter returned non-OK; using fallback');
        return fallback;
      }
      const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      const parsed = content ? this.parseInsight(content) : null;
      return parsed ?? fallback;
    } catch (err) {
      this.logger.warn({ err }, 'OpenRouter unavailable/timed out; using fallback');
      return fallback;
    } finally {
      clearTimeout(timer);
    }
  }

  private parseInsight(content: string): CoachingInsight | null {
    try {
      const obj = JSON.parse(content) as { summary?: unknown; suggestions?: unknown };
      if (typeof obj.summary !== 'string' || !Array.isArray(obj.suggestions)) return null;
      const suggestions: CoachingSuggestion[] = obj.suggestions
        .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
        .map((s) => ({
          title: String(s.title ?? ''),
          detail: String(s.detail ?? ''),
          suggestedMutation: typeof s.suggestedMutation === 'string' ? s.suggestedMutation : null,
        }));
      return { summary: obj.summary, suggestions };
    } catch {
      return null;
    }
  }
}
