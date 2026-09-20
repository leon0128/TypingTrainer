import { Module } from '@nestjs/common';

import { GhostRecordsController } from './ghost-records.controller';
import { GhostRecordsRepository } from './ghost-records.repository';
import { GhostRecordsService } from './ghost-records.service';

@Module({
  controllers: [GhostRecordsController],
  providers: [GhostRecordsRepository, GhostRecordsService],
  exports: [GhostRecordsRepository],
})
export class GhostModule {}
