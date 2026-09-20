import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { UpdatePreferencesRequest } from '@typing-trainer/contracts';
import type { DataSource, EntityManager } from 'typeorm';

/** A user's settings as stored; the appearance columns are null while no row exists. */
export interface PreferencesRow {
  readonly timezone: string;
  readonly locale: string;
  readonly font: string | null;
  readonly font_size: number | null;
  readonly theme: string | null;
  readonly color_preset: string | null;
  readonly sound_pack: string | null;
  readonly sound_volume: number | null;
}

@Injectable()
export class PreferencesRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  find(userId: string): Promise<PreferencesRow | undefined> {
    return this.select(this.dataSource.manager, userId);
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
      const { font, fontSize, theme, colorPreset, soundPack, soundVolume } = patch;
      const stored = [font, fontSize, theme, colorPreset, soundPack, soundVolume];
      if (stored.some((setting) => setting !== undefined)) {
        await manager.query(
          `INSERT INTO user_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
          [userId],
        );
        await manager.query(
          `UPDATE user_preferences SET
             font = COALESCE($2, font),
             font_size = COALESCE($3, font_size),
             theme = COALESCE($4, theme),
             color_preset = COALESCE($5, color_preset),
             sound_pack = COALESCE($6, sound_pack),
             sound_volume = COALESCE($7, sound_volume)
           WHERE user_id = $1`,
          [
            userId,
            font ?? null,
            fontSize ?? null,
            theme ?? null,
            colorPreset ?? null,
            soundPack ?? null,
            soundVolume ?? null,
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
      `SELECT u.timezone, u.locale, p.font, p.font_size, p.theme, p.color_preset, p.sound_pack,
              p.sound_volume
       FROM users u LEFT JOIN user_preferences p ON p.user_id = u.id
       WHERE u.id = $1`,
      [userId],
    );
    return rows[0];
  }
}
