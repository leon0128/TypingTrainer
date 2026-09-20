import { Module } from '@nestjs/common';

import { LanguagesModule } from '../languages/languages.module';
import { ConquestsController } from './conquests.controller';
import { ConquestsRepository } from './conquests.repository';
import { ConquestsService } from './conquests.service';

@Module({
  imports: [LanguagesModule],
  controllers: [ConquestsController],
  providers: [ConquestsRepository, ConquestsService],
  exports: [ConquestsRepository],
})
export class ConquestsModule {}
