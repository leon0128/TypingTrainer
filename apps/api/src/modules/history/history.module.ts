import { Module } from '@nestjs/common';

import { HistoryController } from './history.controller';
import { HistoryRepository } from './history.repository';
import { HistoryService } from './history.service';

@Module({
  controllers: [HistoryController],
  providers: [HistoryRepository, HistoryService],
})
export class HistoryModule {}
