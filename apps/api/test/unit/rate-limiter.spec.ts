/**
 * Rate-limiter window logic (T109 — CHK027). Uses an in-memory Redis stub: allows up to the limit
 * inside one window, rejects the overflow with a sane retry hint, and fails OPEN when Redis breaks.
 */
import { RateLimiterService, RateLimitRule } from '../../src/common/throttling/rate-limiter.service';

type AnyLogger = { warn: jest.Mock };

function makeService(redis: { incr: jest.Mock; expire: jest.Mock }): { svc: RateLimiterService; logger: AnyLogger } {
  const logger: AnyLogger = { warn: jest.fn() };
  // Constructor injection with stubs — no Nest container needed for pure window logic.
  const svc = new RateLimiterService(redis as never, logger as never);
  return { svc, logger };
}

function fakeRedis(): { incr: jest.Mock; expire: jest.Mock; counters: Map<string, number> } {
  const counters = new Map<string, number>();
  return {
    counters,
    incr: jest.fn(async (key: string) => {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    }),
    expire: jest.fn(async () => 1),
  };
}

const rule: RateLimitRule = { bucket: 'test', limit: 3, windowSeconds: 60 };

describe('rate limiter (T109)', () => {
  it('allows requests up to the limit and rejects the overflow', async () => {
    const { svc } = makeService(fakeRedis());
    for (let i = 0; i < rule.limit; i++) {
      const d = await svc.check(rule, 'tenant:user');
      expect(d.allowed).toBe(true);
    }
    const rejected = await svc.check(rule, 'tenant:user');
    expect(rejected.allowed).toBe(false);
    expect(rejected.remaining).toBe(0);
    expect(rejected.retryAfterSeconds).toBeGreaterThan(0);
    expect(rejected.retryAfterSeconds).toBeLessThanOrEqual(rule.windowSeconds);
  });

  it('tracks principals independently', async () => {
    const { svc } = makeService(fakeRedis());
    for (let i = 0; i < rule.limit; i++) await svc.check(rule, 'tenant:a');
    expect((await svc.check(rule, 'tenant:a')).allowed).toBe(false);
    expect((await svc.check(rule, 'tenant:b')).allowed).toBe(true);
  });

  it('sets an expiry on the first hit of a window only', async () => {
    const redis = fakeRedis();
    const { svc } = makeService(redis);
    await svc.check(rule, 'tenant:user');
    await svc.check(rule, 'tenant:user');
    expect(redis.expire).toHaveBeenCalledTimes(1);
  });

  it('fails OPEN (allows) when Redis is unavailable', async () => {
    const broken = {
      incr: jest.fn(async () => {
        throw new Error('connection refused');
      }),
      expire: jest.fn(),
    };
    const { svc, logger } = makeService(broken);
    const d = await svc.check(rule, 'tenant:user');
    expect(d.allowed).toBe(true);
    expect(logger.warn).toHaveBeenCalled();
  });
});
