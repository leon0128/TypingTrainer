import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DEFAULT_PLAY_APPEARANCE, type UpdatePreferencesRequest } from '@typing-trainer/contracts';
import type { DataSource, EntityManager } from 'typeorm';

/** A user's settings as stored; the appearance columns are null while no row exists. */
export interface PreferencesRow {
  readonly timezone: string;
  readonly locale: string;
  readonly theme: string | null;
  readonly skin: string | null;
  readonly sound_pack: string | null;
  readonly sound_volume: number | null;
}

/** One track's stored play look. */
export interface PlayAppearanceRow {
  readonly track: string;
  readonly font: string;
  readonly font_size: number;
  readonly color_preset: string;
}

@Injectable()
export class PreferencesRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  find(userId: string): Promise<PreferencesRow | undefined> {
    return this.select(this.dataSource.manager, userId);
  }

  /** The tracks the user has changed the play look of; the others have their defaults. */
  findPlay(userId: string): Promise<PlayAppearanceRow[]> {
    return this.dataSource.manager.query<PlayAppearanceRow[]>(
      `SELECT track, font, font_size, color_preset FROM user_play_appearance WHERE user_id = $1`,
      [userId],
    );
  }

  /**
   * Stores the settings sent and returns everything as it now is, in one transaction so a reader
   * never sees the language changed but the appearance not. The appearance row is created by the
   * first change, with the column defaults for what was not sent.
   */
  update(userId: string, patch: UpdatePreferencesRequest): Promise<PreferencesRow | undefined> {
    return this.dataSource.transaction(async (manager) => {
      if (patch.locale !== undefined) {
        await manager.query(`UPDATE users SET locale = $2 WHERE id = $1`, [userId, patch.locale]);
      }
      const { theme, skin, soundPack, soundVolume } = patch;
      const stored = [theme, skin, soundPack, soundVolume];
      if (stored.some((setting) => setting !== undefined)) {
        await manager.query(
          `INSERT INTO user_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
          [userId],
        );
        await manager.query(
          `UPDATE user_preferences SET
             theme = COALESCE($2, theme),
             skin = COALESCE($3, skin),
             sound_pack = COALESCE($4, sound_pack),
             sound_volume = COALESCE($5, sound_volume)
           WHERE user_id = $1`,
          [userId, theme ?? null, skin ?? null, soundPack ?? null, soundVolume ?? null],
        );
      }
      const { play } = patch;
      if (play !== undefined) {
        // A track's row is created by its first change, from the defaults for what was not sent.
        await manager.query(
          `INSERT INTO user_play_appearance (user_id, track, font, font_size, color_preset)
           VALUES ($1, $2, COALESCE($3::text, $6::text), COALESCE($4::smallint, $7::smallint),
                  COALESCE($5::text, $8::text))
           ON CONFLICT (user_id, track) DO UPDATE SET
             font = COALESCE($3::text, user_play_appearance.font),
             font_size = COALESCE($4::smallint, user_play_appearance.font_size),
             color_preset = COALESCE($5::text, user_play_appearance.color_preset)`,
          [
            userId,
            play.track,
            play.font ?? null,
            play.fontSize ?? null,
            play.colorPreset ?? null,
            DEFAULT_PLAY_APPEARANCE[play.track].font,
            DEFAULT_PLAY_APPEARANCE[play.track].fontSize,
            DEFAULT_PLAY_APPEARANCE[play.track].colorPreset,
          ],
        );
      }
      return this.select(manager, userId);
    });
  }

  private async select(
    manager: EntityManager,
    userId: string,
  ): Promise<PreferencesRow | undefined> {
    const rows = await manager.query<PreferencesRow[]>(
      `SELECT u.timezone, u.locale, p.theme, p.skin, p.sound_pack, p.sound_volume
       FROM users u LEFT JOIN user_preferences p ON p.user_id = u.id
       WHERE u.id = $1`,
      [userId],
    );
    return rows[0];
  }
}
