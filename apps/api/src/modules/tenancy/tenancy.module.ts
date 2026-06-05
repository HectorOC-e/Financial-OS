import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../../common/persistence/prisma.service';
import { TenancyService } from './tenancy.service';

/**
 * Global tenancy plumbing: PrismaService + the tenant-scoped transaction wrapper. Exported
 * globally so every feature module's repositories can derive scoping without re-importing (R3).
 */
@Global()
@Module({
  providers: [PrismaService, TenancyService],
  exports: [PrismaService, TenancyService],
})
export class TenancyModule {}
