import { Module } from '@nestjs/common';

import { RatingsController } from './ratings.controller';
import { RatingsRepository } from './ratings.repository';
import { RatingsService } from './ratings.service';

@Module({
  controllers: [RatingsController],
  providers: [RatingsRepository, RatingsService],
  exports: [RatingsService],
})
export class RatingsModule {}
