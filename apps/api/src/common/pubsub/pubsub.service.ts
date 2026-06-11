/**
 * Minimal in-process publish/subscribe for GraphQL subscriptions (T063 support).
 *
 * Provides `publish(trigger, payload)` and an `asyncIterator(trigger)` consumable by NestJS
 * `@Subscription` resolvers. This in-memory implementation is sufficient for a single API instance;
 * horizontal scale-out would back it with a Redis pub/sub adapter (the cache module already exposes a
 * Redis client). The WS transport wiring in GraphQLModule is a deployment concern.
 */
import { Injectable } from '@nestjs/common';

type Listener = (payload: unknown) => void;

@Injectable()
export class PubSubService {
  private readonly channels = new Map<string, Set<Listener>>();

  publish(trigger: string, payload: unknown): void {
    const listeners = this.channels.get(trigger);
    if (listeners) for (const l of [...listeners]) l(payload);
  }

  asyncIterator<T>(trigger: string): AsyncIterator<T> & AsyncIterable<T> {
    const queue: T[] = [];
    let pending: ((r: IteratorResult<T>) => void) | null = null;
    let closed = false;

    const listener: Listener = (payload) => {
      if (closed) return;
      if (pending) {
        pending({ value: payload as T, done: false });
        pending = null;
      } else {
        queue.push(payload as T);
      }
    };

    let set = this.channels.get(trigger);
    if (!set) {
      set = new Set();
      this.channels.set(trigger, set);
    }
    set.add(listener);

    const detach = (): void => {
      closed = true;
      set?.delete(listener);
    };

    return {
      next: (): Promise<IteratorResult<T>> => {
        if (queue.length > 0) return Promise.resolve({ value: queue.shift() as T, done: false });
        if (closed) return Promise.resolve({ value: undefined as never, done: true });
        return new Promise((resolve) => {
          pending = resolve;
        });
      },
      return: (): Promise<IteratorResult<T>> => {
        detach();
        return Promise.resolve({ value: undefined as never, done: true });
      },
      throw: (err?: unknown): Promise<IteratorResult<T>> => {
        detach();
        return Promise.reject(err);
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }
}
