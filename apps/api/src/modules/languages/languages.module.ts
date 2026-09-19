import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProgrammingLanguage } from '../../entities';
import { LanguagesController } from './languages.controller';
import { LanguagesRepository } from './languages.repository';
import { LanguagesService } from './languages.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProgrammingLanguage])],
  controllers: [LanguagesController],
  providers: [LanguagesRepository, LanguagesService],
  exports: [LanguagesRepository],
})
export class LanguagesModule {}
