import { Check, Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';

import { User } from './user.entity';

/**
 * Theme, skin, and sound settings (the play screen's look is per track, §13.10) (§8.2, §8.3, §9.3), one row per user, created by the first change;
 * an account with no row has the defaults.
 */
@Entity({ name: 'user_preferences' })
@Check('chk_user_preferences_theme', `"theme" IN ('system', 'light', 'dark', 'high-contrast')`)
@Check('chk_user_preferences_skin', `"skin" IN ('classic', 'neon', 'pixel', 'fantasy', 'pop')`)
@Check('chk_user_preferences_sound_pack', `"sound_pack" IN ('off', 'mechanical', 'soft', 'beep')`)
@Check('chk_user_preferences_sound_volume', `"sound_volume" BETWEEN 0 AND 100`)
export class UserPreferences {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_user_preferences_user' })
  user?: User;

  @Column({ name: 'theme', type: 'text', default: 'system' })
  theme!: string;

  @Column({ name: 'skin', type: 'text', default: 'classic' })
  skin!: string;

  /** Key sound pack, `off` until chosen (§8.3). */
  @Column({ name: 'sound_pack', type: 'text', default: 'off' })
  soundPack!: string;

  /** Key sound volume, 0 to 100 (§8.3). */
  @Column({ name: 'sound_volume', type: 'smallint', default: 30 })
  soundVolume!: number;
}
