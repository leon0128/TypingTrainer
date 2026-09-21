import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  AppearanceSchema,
  DEFAULT_APPEARANCE,
  DEFAULT_PLAY_APPEARANCE,
  PlayAppearanceSchema,
  type PlayAppearances,
  type Track,
  DEFAULT_SOUND,
  SoundSchema,
  LocaleSchema,
  type Preferences,
  type UpdatePreferencesRequest,
  type User,
} from '@typing-trainer/contracts';

import { accountTracks, assertTrackAvailable } from '../../common/pool-access';
import {
  PreferencesRepository,
  type PlayAppearanceRow,
  type PreferencesRow,
} from './preferences.repository';

export type PreferencesStore = Pick<PreferencesRepository, 'find' | 'findPlay' | 'update'>;

@Injectable()
export class PreferencesService {
  constructor(@Inject(PreferencesRepository) private readonly preferences: PreferencesStore) {}

  async get(user: User): Promise<Preferences> {
    const [row, play] = await Promise.all([
      this.preferences.find(user.id),
      this.preferences.findPlay(user.id),
    ]);
    return this.present(row, play);
  }

  async update(user: User, request: UpdatePreferencesRequest): Promise<Preferences> {
    // A track the account may not use is refused whole, before anything is stored (§13.11).
    if (request.play !== undefined) assertTrackAvailable(user, request.play.track);
    const row = await this.preferences.update(user.id, request);
    return this.present(row, await this.preferences.findPlay(user.id));
  }

  /** A missing user row means the account was just deleted, so the session is no longer valid. */
  private present(row: PreferencesRow | undefined, play: PlayAppearanceRow[]): Preferences {
    if (row === undefined) throw new UnauthorizedException('authentication required');
    return {
      timezone: row.timezone,
      locale: LocaleSchema.parse(row.locale),
      ...AppearanceSchema.parse({
        theme: row.theme ?? DEFAULT_APPEARANCE.theme,
        skin: row.skin ?? DEFAULT_APPEARANCE.skin,
      }),
      play: playOf(row.locale, play),
      ...SoundSchema.parse({
        soundPack: row.sound_pack ?? DEFAULT_SOUND.soundPack,
        soundVolume: row.sound_volume ?? DEFAULT_SOUND.soundVolume,
      }),
    };
  }
}

/**
 * The play look of every track the account may use: what it stored, else the track's defaults. The
 * Japanese track is left out for an account whose display language is not Japanese (§13.11).
 */
function playOf(locale: string, rows: PlayAppearanceRow[]): PlayAppearances {
  const result: Partial<Record<Track, ReturnType<typeof PlayAppearanceSchema.parse>>> = {};
  for (const track of accountTracks({ locale })) {
    const stored = rows.find((row) => row.track === track);
    result[track] =
      stored === undefined
        ? DEFAULT_PLAY_APPEARANCE[track]
        : PlayAppearanceSchema.parse({
            font: stored.font,
            fontSize: stored.font_size,
            colorPreset: stored.color_preset,
          });
  }
  return result as PlayAppearances;
}
