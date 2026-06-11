import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { APP_GUARD } from '@nestjs/core';
import { join } from 'path';
import { LoggerModule } from 'nestjs-pino';
import { configValidationSchema } from './common/config/config.module';
import { buildGraphQLContext } from './common/graphql/graphql-context';
import { DomainError, toGraphQLError } from './common/errors';
import { CacheModule } from './common/cache/cache.module';
import { TenancyModule } from './modules/tenancy/tenancy.module';
import { EventsModule } from './modules/events/events.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { PermissionsGuard } from './modules/permissions/permissions.guard';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { ContributionsModule } from './modules/contributions/contributions.module';
import { SharedElementsModule } from './modules/shared-elements/shared-elements.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { AiCoachingModule } from './modules/ai-coaching/ai-coaching.module';

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
      // Map any DomainError that reaches Apollo to a stable extensions.code (Principle XI).
      formatError: (formatted, error) => {
        const original = (error as { originalError?: unknown })?.originalError;
        if (original instanceof DomainError) {
          const mapped = toGraphQLError(original);
          return { ...formatted, message: mapped.message, extensions: mapped.extensions };
        }
        return formatted;
      },
    }),
    // Foundational, globally-exported modules (Phase 2).
    CacheModule,
    TenancyModule,
    EventsModule,
    SchedulingModule,
    PermissionsModule,
    // Feature modules (Phase 3+).
    ProfilesModule,
    ContributionsModule,
    SharedElementsModule,
    AccountsModule,
    AiCoachingModule,
  ],
  providers: [
    // Capability matrix enforced on every @RequireCapability-annotated operation (FR-006).
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
