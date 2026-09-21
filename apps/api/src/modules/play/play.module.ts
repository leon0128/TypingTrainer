import { Module } from '@nestjs/common';

import { GhostModule } from '../ghost/ghost.module';
import { RatingsModule } from '../ratings/ratings.module';
import { IssuedRunsRepository } from './issued-runs.repository';
import { PlayController } from './play.controller';
import { PlayService } from './play.service';

@Module({
  imports: [GhostModule, RatingsModule],
  controllers: [PlayController],
  providers: [IssuedRunsRepository, PlayService],
})
export class PlayModule {}
