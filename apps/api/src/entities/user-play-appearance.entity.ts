import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import { User } from './user.entity';

/**
 * The look of the play screen in one track (§13.10, §9.3): font, size, and colour set. A row is
 * created by the first change to a track; a track with no row has its defaults.
 */
@Entity({ name: 'user_play_appearance' })
@Check('chk_user_play_appearance_track', `"track" IN ('code', 'natural-ja', 'natural-en')`)
@Check(
  'chk_user_play_appearance_font',
  `("track" = 'natural-ja' AND "font" IN ('m-plus-1-code', 'biz-ud-gothic')) OR ("track" <> 'natural-ja' AND "font" IN ('jetbrains-mono', 'fira-code', 'source-code-pro', 'ibm-plex-mono', 'noto-sans-mono'))`,
)
@Check('chk_user_play_appearance_font_size', `"font_size" IN (14, 16, 18, 20, 24)`)
@Check(
  'chk_user_play_appearance_color_preset',
  `"color_preset" IN ('standard', 'okabe-ito', 'monochrome')`,
)
export class UserPlayAppearance {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_user_play_appearance_user' })
  user?: User;

  @PrimaryColumn({ name: 'track', type: 'text' })
  track!: string;

  @Column({ name: 'font', type: 'text' })
  font!: string;

  @Column({ name: 'font_size', type: 'smallint' })
  fontSize!: number;

  @Column({ name: 'color_preset', type: 'text' })
  colorPreset!: string;
}
