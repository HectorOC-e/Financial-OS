import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaClient wrapper managed by Nest's lifecycle. The application role is expected to be a
 * NON-superuser so PostgreSQL RLS (migration T016) is enforced. Tenant scoping is applied per
 * transaction by the TenancyService (T017), not here.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
