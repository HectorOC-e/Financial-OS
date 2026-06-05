import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { APP_GUARD } from '@nestjs/core';
import { join } from 'path';
import { LoggerModule } from 'nestjs-pino';
import { configValidationSchema } from './common/config/config.module';
import { buildGraphQLContext } from './common/graphql/graphql-context';
import { CacheModule } from './common/cache/cache.module';
import { TenancyModule } from './modules/tenancy/tenancy.module';
import { EventsModule } from './modules/events/events.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { PermissionsGuard } from './modules/permissions/permissions.guard';

/**
 * Root module. Foundational infrastructure (Phase 2): tenancy/RLS, Redis cache, event backbone,
 * scheduling, permissions/audit. Feature modules (profiles, accounts, contributions,
 * shared-elements, ai-coaching) are registered here as they land in Phase 3+ per tasks.md.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: configValidationSchema,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      },
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      // Code-first: SDL is emitted to the shared contracts package (source of truth).
      autoSchemaFile: join(process.cwd(), '../../packages/contracts/schema.graphql'),
      sortSchema: true,
      playground: process.env.NODE_ENV !== 'production',
      context: buildGraphQLContext,
    }),
    // Foundational, globally-exported modules (Phase 2).
    CacheModule,
    TenancyModule,
    EventsModule,
    SchedulingModule,
    PermissionsModule,
  ],
  providers: [
    // Capability matrix enforced on every @RequireCapability-annotated operation (FR-006).
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
