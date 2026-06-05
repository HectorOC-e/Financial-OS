import { Global, Module } from '@nestjs/common';
import { OutboxWriter } from './outbox/outbox.writer';
import { OutboxDispatcher } from './dispatcher/outbox.dispatcher';
import { EventRegistry } from './registry/event-registry';
import { DomainEventsWorker } from './registry/domain-events.worker';

/**
 * Event-driven backbone (Principle VI): transactional outbox writer, the outbox→BullMQ dispatcher,
 * the handler registry, and the consuming worker. Exported globally so feature modules can write
 * events (OutboxWriter) and register consumers (EventRegistry).
 */
@Global()
@Module({
  providers: [OutboxWriter, OutboxDispatcher, EventRegistry, DomainEventsWorker],
  exports: [OutboxWriter, EventRegistry],
})
export class EventsModule {}
