import { Injectable } from '@nestjs/common';
import { DomainEventEnvelope } from '../event-envelope';

/**
 * A consumer of domain events. Handlers MUST be idempotent (re-delivery safe); the worker also
 * applies an eventId-keyed idempotency guard, but handlers should not assume exactly-once.
 */
export interface EventHandler {
  /** Stable, unique name used to namespace the idempotency key. */
  readonly name: string;
  /** Event types this handler cares about. */
  readonly eventTypes: string[];
  handle(envelope: DomainEventEnvelope): Promise<void>;
}

/**
 * In-process registry of event handlers (T023). Feature modules register their consumers here on
 * init; the DomainEventsWorker fans each delivered event out to the matching handlers.
 */
@Injectable()
export class EventRegistry {
  private readonly byType = new Map<string, EventHandler[]>();

  register(handler: EventHandler): void {
    for (const type of handler.eventTypes) {
      const list = this.byType.get(type) ?? [];
      list.push(handler);
      this.byType.set(type, list);
    }
  }

  handlersFor(eventType: string): EventHandler[] {
    return this.byType.get(eventType) ?? [];
  }
}
