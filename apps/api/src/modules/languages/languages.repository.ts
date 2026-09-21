import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { Language } from '../../entities';

@Injectable()
export class LanguagesRepository {
  constructor(
    @InjectRepository(Language)
    private readonly languages: Repository<Language>,
  ) {}

  /** Enabled languages in display order. */
  findEnabled(): Promise<Language[]> {
    return this.languages.find({
      where: { enabled: true },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
  }
}
