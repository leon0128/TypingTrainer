import { Check, Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';

import { User } from './user.entity';

/**
 * Appearance settings (§8.2, §9.3), one row per user, created by the first change; an account with
 * no row has the defaults. Sound settings will add columns here with F-13.
 */
@Entity({ name: 'user_preferences' })
@Check(
  'chk_user_preferences_font',
  `"font" IN ('jetbrains-mono', 'fira-code', 'source-code-pro', 'ibm-plex-mono', 'noto-sans-mono')`,
)
@Check('chk_user_preferences_font_size', `"font_size" IN (14, 16, 18, 20, 24)`)
@Check('chk_user_preferences_theme', `"theme" IN ('system', 'light', 'dark', 'high-contrast')`)
@Check(
  'chk_user_preferences_color_preset',
  `"color_preset" IN ('standard', 'okabe-ito', 'monochrome')`,
)
export class UserPreferences {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_user_preferences_user' })
  user?: User;

  @Column({ name: 'font', type: 'text', default: 'jetbrains-mono' })
  font!: string;

  @Column({ name: 'font_size', type: 'smallint', default: 18 })
  fontSize!: number;

  @Column({ name: 'theme', type: 'text', default: 'system' })
  theme!: string;

  @Column({ name: 'color_preset', type: 'text', default: 'standard' })
  colorPreset!: string;
}
