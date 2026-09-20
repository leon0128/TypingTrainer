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
 * A run the server issued (§9.5, §9.8): the blocks, seed, and content revision a client received,
 * kept so a submitted result can be replayed against exactly what was issued and counted once.
 * Rows are deleted a day after they are issued; a result is only accepted for 17.5 minutes.
 */
@Entity({ name: 'issued_runs' })
@Index('idx_issued_runs_user', ['userId', 'issuedAt'])
@Check('chk_issued_runs_mode', `"mode" IN ('single', 'cpu', 'ghost')`)
@Check(
  'chk_issued_runs_opponent',
  `("mode" = 'single' AND "cpu_level" IS NULL AND "ghost_period" IS NULL AND "ghost_score" IS NULL)
   OR ("mode" = 'cpu' AND "cpu_level" IS NOT NULL AND "cpu_level" BETWEEN 1 AND 100
       AND "ghost_period" IS NULL AND "ghost_score" IS NULL)
   OR ("mode" = 'ghost' AND "cpu_level" IS NULL AND "ghost_period" IS NOT NULL
       AND "ghost_period" IN ('daily', 'weekly', 'total')
       AND "ghost_score" IS NOT NULL AND "ghost_score" >= 1)`,
)
@Check('chk_issued_runs_blocks', `cardinality("block_ids") = 20`)
@Check('chk_issued_runs_submitted', `"submitted_at" IS NULL OR "submitted_at" >= "issued_at"`)
export class IssuedRun {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_issued_runs_user' })
  user?: User;

  @Column({ name: 'language_id', type: 'int' })
  languageId!: number;

  @ManyToOne(() => ProgrammingLanguage, { nullable: false })
  @JoinColumn({ name: 'language_id', foreignKeyConstraintName: 'fk_issued_runs_language' })
  language?: ProgrammingLanguage;

  /** 'single' | 'cpu' | 'ghost'; Ghost is not issued yet (§10). */
  @Column({ name: 'mode', type: 'text' })
  mode!: string;

  /** The CPU's level; set exactly when the mode is 'cpu' (§4.3). */
  @Column({ name: 'cpu_level', type: 'smallint', nullable: true })
  cpuLevel!: number | null;

  /** Ghost only: the period of the record reproduced, and its score as it was when issued (§4.4). */
  @Column({ name: 'ghost_period', type: 'text', nullable: true })
  ghostPeriod!: string | null;

  @Column({ name: 'ghost_score', type: 'int', nullable: true })
  ghostScore!: number | null;

  /** Seed of the block draw, as the pg driver returns bigint: a string. */
  @Column({ name: 'rng_seed', type: 'bigint' })
  rngSeed!: string;

  @Column({ name: 'content_revision', type: 'text' })
  contentRevision!: string;

  /** The issued block ids, in order. */
  @Column({ name: 'block_ids', type: 'text', array: true })
  blockIds!: string[];

  @Column({ name: 'issued_at', type: 'timestamptz', default: () => 'now()' })
  issuedAt!: Date;

  /** Set when a result is submitted, which may happen only once. */
  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt!: Date | null;
}
