import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { ProgrammingLanguage } from './programming-language.entity';
import { User } from './user.entity';

/**
 * One finished run (§9.3). Conquest records, rankings, and the dashboard are all derived from
 * this table. `numeric` and `bigint` columns are returned by the pg driver as strings.
 *
 * The ranking indexes list `score` ascending: a B-tree is scanned backwards for `ORDER BY score
 * DESC` under equality on the leading columns, so a descending key adds nothing.
 */
@Entity({ name: 'play_sessions' })
@Index('idx_sessions_daily', ['userId', 'languageId', 'localDate', 'score'])
@Index('idx_sessions_weekly', ['userId', 'languageId', 'localWeekStart', 'score'])
@Index('idx_sessions_alltime', ['userId', 'languageId', 'score'])
@Index('idx_sessions_conquest', ['userId', 'languageId', 'cpuLevel'], {
  where: `"mode" = 'cpu' AND "result" = 'win'`,
})
@Check('chk_play_sessions_mode', `"mode" IN ('single', 'cpu', 'ghost')`)
// Every comparison on a nullable column is paired with IS NOT NULL: `NULL BETWEEN 1 AND 100` is
// NULL rather than false, and a CHECK constraint only rejects false.
@Check(
  'chk_play_sessions_opponent',
  `("mode" = 'single' AND "cpu_level" IS NULL AND "ghost_period" IS NULL
     AND "opponent_score" IS NULL AND "result" IS NULL)
   OR ("mode" = 'cpu' AND "cpu_level" IS NOT NULL AND "cpu_level" BETWEEN 1 AND 100
     AND "ghost_period" IS NULL AND "opponent_score" IS NOT NULL
     AND "result" IS NOT NULL AND "result" IN ('win', 'lose'))
   OR ("mode" = 'ghost' AND "cpu_level" IS NULL AND "ghost_period" IS NOT NULL
     AND "ghost_period" IN ('daily', 'weekly', 'total') AND "opponent_score" IS NOT NULL
     AND "result" IS NOT NULL AND "result" IN ('win', 'lose'))`,
)
@Check(
  'chk_play_sessions_counts',
  `"duration_sec" > 0 AND "raw_keystrokes" >= 0 AND "effective_keystrokes" >= 0
   AND "miss_count" >= 0 AND "kpm" >= 0 AND "accuracy" BETWEEN 0 AND 1 AND "score" >= 0
   AND ("opponent_score" IS NULL OR "opponent_score" >= 0)`,
)
@Check('chk_play_sessions_week_start', `EXTRACT(DOW FROM "local_week_start") = 0`)
export class PlaySession {
  /** DEFAULT gen_random_uuid(), given uuidExtension 'pgcrypto' in the data source options. */
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_play_sessions_user' })
  user?: User;

  /** 'single' | 'cpu' | 'ghost' */
  @Column({ name: 'mode', type: 'text' })
  mode!: string;

  @Column({ name: 'language_id', type: 'int' })
  languageId!: number;

  @ManyToOne(() => ProgrammingLanguage, { nullable: false })
  @JoinColumn({ name: 'language_id', foreignKeyConstraintName: 'fk_play_sessions_language' })
  language?: ProgrammingLanguage;

  @Column({ name: 'duration_sec', type: 'int', default: 120 })
  durationSec!: number;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  /** The profile time zone applied to `local_date` and `local_week_start` (§6.4). */
  @Column({ name: 'timezone', type: 'text' })
  timezone!: string;

  @Column({ name: 'local_date', type: 'date' })
  localDate!: string;

  /** The Sunday that starts the local week. */
  @Column({ name: 'local_week_start', type: 'date' })
  localWeekStart!: string;

  @Column({ name: 'raw_keystrokes', type: 'int' })
  rawKeystrokes!: number;

  @Column({ name: 'effective_keystrokes', type: 'int' })
  effectiveKeystrokes!: number;

  @Column({ name: 'miss_count', type: 'int' })
  missCount!: number;

  @Column({ name: 'kpm', type: 'numeric', precision: 7, scale: 2 })
  kpm!: string;

  @Column({ name: 'accuracy', type: 'numeric', precision: 5, scale: 4 })
  accuracy!: string;

  @Column({ name: 'score', type: 'int' })
  score!: number;

  @Column({ name: 'cpu_level', type: 'int', nullable: true })
  cpuLevel!: number | null;

  /** 'daily' | 'weekly' | 'total', Ghost runs only. */
  @Column({ name: 'ghost_period', type: 'text', nullable: true })
  ghostPeriod!: string | null;

  @Column({ name: 'opponent_score', type: 'int', nullable: true })
  opponentScore!: number | null;

  /** 'win' | 'lose'; a tie is stored as 'win' (Q16). */
  @Column({ name: 'result', type: 'text', nullable: true })
  result!: string | null;

  @Column({ name: 'rng_seed', type: 'bigint' })
  rngSeed!: string;

  /** Revision of the content bundle the blocks came from. */
  @Column({ name: 'content_revision', type: 'text' })
  contentRevision!: string;

  @Column({ name: 'app_version', type: 'text' })
  appVersion!: string;
}
