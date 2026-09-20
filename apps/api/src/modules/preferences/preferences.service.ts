import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  AppearanceSchema,
  DEFAULT_APPEARANCE,
  DEFAULT_SOUND,
  SoundSchema,
  LocaleSchema,
  type Preferences,
  type UpdatePreferencesRequest,
  type User,
} from '@typing-trainer/contracts';

import { PreferencesRepository, type PreferencesRow } from './preferences.repository';

export type PreferencesStore = Pick<PreferencesRepository, 'find' | 'update'>;

@Injectable()
export class PreferencesService {
  constructor(@Inject(PreferencesRepository) private readonly preferences: PreferencesStore) {}

  async get(user: User): Promise<Preferences> {
    return this.present(await this.preferences.find(user.id));
  }

  async update(user: User, request: UpdatePreferencesRequest): Promise<Preferences> {
    return this.present(await this.preferences.update(user.id, request));
  }

  /** A missing user row means the account was just deleted, so the session is no longer valid. */
  private present(row: PreferencesRow | undefined): Preferences {
    if (row === undefined) throw new UnauthorizedException('authentication required');
    return {
      timezone: row.timezone,
      locale: LocaleSchema.parse(row.locale),
      ...AppearanceSchema.parse({
        font: row.font ?? DEFAULT_APPEARANCE.font,
        fontSize: row.font_size ?? DEFAULT_APPEARANCE.fontSize,
        theme: row.theme ?? DEFAULT_APPEARANCE.theme,
        colorPreset: row.color_preset ?? DEFAULT_APPEARANCE.colorPreset,
      }),
      ...SoundSchema.parse({
        soundPack: row.sound_pack ?? DEFAULT_SOUND.soundPack,
        soundVolume: row.sound_volume ?? DEFAULT_SOUND.soundVolume,
      }),
    };
  }
}
