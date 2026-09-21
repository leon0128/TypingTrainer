import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import { ProgrammingLanguage } from './programming-language.entity';
import { User } from './user.entity';

/**
 * A player's rating in one language (§4.3.5, §9.3), from vs CPU matches only. A row is created by
 * the player's first vs CPU match in the language; no row means unplayed, which rates 0. The
 * overall rating and the rank are worked out from these rows when read and are never stored.
 */
@Entity({ name: 'language_ratings' })
@Check('chk_language_ratings_rating', `"rating" BETWEEN 0 AND 2000`)
@Check('chk_language_ratings_games', `"games_played" >= 0`)
export class LanguageRating {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_language_ratings_user' })
  user?: User;

  @PrimaryColumn({ name: 'language_id', type: 'int' })
  languageId!: number;

  @ManyToOne(() => ProgrammingLanguage, { nullable: false })
  @JoinColumn({ name: 'language_id', foreignKeyConstraintName: 'fk_language_ratings_language' })
  language?: ProgrammingLanguage;

  @Column({ name: 'rating', type: 'int', default: 0 })
  rating!: number;

  /** vs CPU matches counted, which sets how fast the rating moves at first. */
  @Column({ name: 'games_played', type: 'int', default: 0 })
  gamesPlayed!: number;
}
