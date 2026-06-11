/**
 * Coaching read-model projection (T099 — Principle III/R9). Pure and framework-free, assembled from
 * the shared analytics outputs — it has NO write collaborators and can never mutate financial state.
 *
 * The projection also produces a *redacted* prompt payload (no display names, anonymized member
 * indices) and a deterministic *fallback* insight used when the LLM is unavailable (T102). Suggestions
 * are advisory only; `suggestedMutation` is a hint a permitted human must apply through a normal
 * validated mutation.
 */
export type StandingState = 'ON_TRACK' | 'AHEAD' | 'BEHIND';

export interface CoachingMember {
  membershipId: string;
  expectedCents: bigint;
  actualCents: bigint;
  state: StandingState;
}

export interface CoachingReadModel {
  sharedProfileId: string;
  baseCurrency: string;
  poolExpectedCents: bigint;
  poolActualCents: bigint;
  members: CoachingMember[];
}

export interface CoachingSuggestion {
  title: string;
  detail: string;
  suggestedMutation: string | null;
}

export interface CoachingInsight {
  summary: string;
  suggestions: CoachingSuggestion[];
}

/** Redacted prompt payload: no PII, members anonymized to stable indices. */
export function redactForPrompt(model: CoachingReadModel): Record<string, unknown> {
  return {
    currency: model.baseCurrency,
    poolExpected: model.poolExpectedCents.toString(),
    poolActual: model.poolActualCents.toString(),
    members: model.members.map((m, i) => ({
      member: `member_${i + 1}`,
      expected: m.expectedCents.toString(),
      actual: m.actualCents.toString(),
      state: m.state,
    })),
  };
}

/**
 * Deterministic, rule-based fallback insight (T102) — used when the LLM is unavailable, and as a safe
 * baseline. Derives entirely from the read model; performs no I/O.
 */
export function buildFallbackInsight(model: CoachingReadModel): CoachingInsight {
  const behind = model.members.filter((m) => m.state === 'BEHIND').length;
  const shortfall = model.poolExpectedCents - model.poolActualCents;
  const suggestions: CoachingSuggestion[] = [];

  if (behind > 0) {
    suggestions.push({
      title: 'Members are behind on contributions',
      detail: `${behind} member(s) are below their expected contribution this period.`,
      suggestedMutation: 'recordContribution',
    });
  }
  if (shortfall > 0n) {
    suggestions.push({
      title: 'Pool is under its expected total',
      detail: `The pool is short by ${shortfall.toString()} minor units versus the expected total.`,
      suggestedMutation: null,
    });
  }
  if (suggestions.length === 0) {
    suggestions.push({
      title: 'On track',
      detail: 'Contributions are meeting expectations this period.',
      suggestedMutation: null,
    });
  }

  return {
    summary:
      shortfall > 0n
        ? 'This profile is currently below its expected contribution pool.'
        : 'This profile is on track with its contribution plan.',
    suggestions,
  };
}
