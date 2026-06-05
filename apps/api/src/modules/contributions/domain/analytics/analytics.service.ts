import { Injectable } from '@nestjs/common';
import {
  ContributionStanding,
  MemberExpectation,
  computeStanding,
  expectedContributionCents,
  poolActualTotalCents,
  poolExpectedTotalCents,
} from './analytics';

/**
 * Injectable seam over the pure analytics core (T030 / Principle X). Holds NO state and performs NO
 * I/O — callers pass already-loaded snapshots/records in. This is the single service GraphQL,
 * exports, and the read-only AI coaching projection call so every channel produces identical numbers.
 */
@Injectable()
export class AnalyticsService {
  expectedFor(incomeCents: bigint, percentageBp: number): bigint {
    return expectedContributionCents(incomeCents, percentageBp);
  }

  poolExpectedTotal(expectations: MemberExpectation[]): bigint {
    return poolExpectedTotalCents(expectations);
  }

  poolActualTotal(recordAmountsCents: bigint[]): bigint {
    return poolActualTotalCents(recordAmountsCents);
  }

  standing(expectedCents: bigint, actualCents: bigint): ContributionStanding {
    return computeStanding(expectedCents, actualCents);
  }
}
