import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { TenantTx } from '../../tenancy/tenancy.service';
import { DEFAULT_SCHEMA_VERSION, NewDomainEvent } from '../event-envelope';

/**
 * Transactional outbox writer (R4 / T021). Domain events are persisted to `OutboxEvent` in the
 * SAME transaction as the state change, guaranteeing atomicity: no event without its state change,
 * no state change without its event. A separate dispatcher (T022) relays rows to BullMQ.
 *
 * `actorMembershipId` is folded into the stored payload under `actorMembershipId` (the table has no
 * dedicated column); the dispatcher lifts it back into the envelope.
 */
@Injectable()
export class OutboxWriter {
  /** Append an event within an existing tenant-scoped transaction. */
  async write(tx: TenantTx, tenantId: string, event: NewDomainEvent): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        tenantId,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        schemaVersion: event.schemaVersion ?? DEFAULT_SCHEMA_VERSION,
        payload: {
          ...event.payload,
          actorMembershipId: event.actorMembershipId ?? null,
        } as Prisma.InputJsonObject,
      },
    });
  }

  /** Append several events atomically. */
  async writeAll(tx: TenantTx, tenantId: string, events: NewDomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.write(tx, tenantId, event);
    }
  }
}
