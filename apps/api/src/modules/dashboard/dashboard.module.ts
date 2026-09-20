import { Module } from '@nestjs/common';

import { ConquestsModule } from '../conquests/conquests.module';
import { LanguagesModule } from '../languages/languages.module';
import { DashboardController } from './dashboard.controller';
import { DashboardRepository } from './dashboard.repository';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [ConquestsModule, LanguagesModule],
  controllers: [DashboardController],
  providers: [DashboardRepository, DashboardService],
})
export class DashboardModule {}
