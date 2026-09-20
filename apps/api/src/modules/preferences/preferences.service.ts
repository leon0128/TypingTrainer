import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  LocaleSchema,
  type Preferences,
  type UpdatePreferencesRequest,
  type User,
} from '@typing-trainer/contracts';

import { PreferencesRepository } from './preferences.repository';

export type PreferencesStore = Pick<PreferencesRepository, 'updateLocale'>;

@Injectable()
export class PreferencesService {
  constructor(@Inject(PreferencesRepository) private readonly preferences: PreferencesStore) {}

  /** The user as the session lookup just read them, so this needs no query of its own. */
  get(user: User): Preferences {
    return { timezone: user.timezone, locale: LocaleSchema.parse(user.locale) };
  }

  async update(user: User, request: UpdatePreferencesRequest): Promise<Preferences> {
    if (request.locale === undefined) return this.get(user);
    const row = await this.preferences.updateLocale(user.id, request.locale);
    // The session was valid a moment ago, so a missing row means the account was just deleted.
    if (row === undefined) throw new UnauthorizedException('authentication required');
    return { timezone: row.timezone, locale: LocaleSchema.parse(row.locale) };
  }
}
