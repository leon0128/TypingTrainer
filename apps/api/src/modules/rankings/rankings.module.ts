import { Module } from '@nestjs/common';

import { LanguagesModule } from '../languages/languages.module';
import { RankingsController } from './rankings.controller';
import { RankingsRepository } from './rankings.repository';
import { RankingsService } from './rankings.service';

@Module({
  imports: [LanguagesModule],
  controllers: [RankingsController],
  providers: [RankingsRepository, RankingsService],
})
export class RankingsModule {}
