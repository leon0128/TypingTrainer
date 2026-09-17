import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { ProgrammingLanguage } from '../../entities';

@Injectable()
export class LanguagesRepository {
  constructor(
    @InjectRepository(ProgrammingLanguage)
    private readonly languages: Repository<ProgrammingLanguage>,
  ) {}

  /** Enabled languages in display order. */
  findEnabled(): Promise<ProgrammingLanguage[]> {
    return this.languages.find({
      where: { enabled: true },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
  }
}
