import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { LoggerModule } from 'nestjs-pino';
import { configValidationSchema } from './common/config/config.module';

/**
 * Root module. Feature modules (profiles, accounts, contributions, shared-elements,
 * permissions, tenancy, events, scheduling, ai-coaching) are registered here as they
 * are implemented in Phase 2+ per tasks.md.
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
    }),
  ],
})
export class AppModule {}
