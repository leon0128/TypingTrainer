import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Locale } from '@typing-trainer/contracts';
import type { DataSource } from 'typeorm';

import { returnedRows } from '../../database/returned-rows';

export interface PreferencesRow {
  readonly timezone: string;
  readonly locale: string;
}

@Injectable()
export class PreferencesRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Stores the display language; returns the user's time zone and language as they now are. */
  async updateLocale(userId: string, locale: Locale): Promise<PreferencesRow | undefined> {
    const result: unknown = await this.dataSource.query(
      `UPDATE users SET locale = $2 WHERE id = $1 RETURNING timezone, locale`,
      [userId, locale],
    );
    return returnedRows<PreferencesRow>(result)[0];
  }
}
