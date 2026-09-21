import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Language } from '../../entities';
import { LanguagesController } from './languages.controller';
import { LanguagesRepository } from './languages.repository';
import { LanguagesService } from './languages.service';

@Module({
  imports: [TypeOrmModule.forFeature([Language])],
  controllers: [LanguagesController],
  providers: [LanguagesRepository, LanguagesService],
  exports: [LanguagesRepository],
})
export class LanguagesModule {}
