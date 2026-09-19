import { Module } from '@nestjs/common';

import { IssuedRunsRepository } from './issued-runs.repository';
import { PlayController } from './play.controller';
import { PlayService } from './play.service';

@Module({
  controllers: [PlayController],
  providers: [IssuedRunsRepository, PlayService],
})
export class PlayModule {}
