import { Module } from '@nestjs/common';

import { PreferencesController } from './preferences.controller';
import { PreferencesRepository } from './preferences.repository';
import { PreferencesService } from './preferences.service';

@Module({
  controllers: [PreferencesController],
  providers: [PreferencesRepository, PreferencesService],
})
export class PreferencesModule {}
