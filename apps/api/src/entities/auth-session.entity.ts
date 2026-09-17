import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import { User } from './user.entity';

/**
 * A server-side sign-in session (§7). The cookie carries a random token; only its SHA-256 is
 * stored, so a leaked table cannot be replayed. A session is valid while `expires_at` (30 days
 * after sign-in) and `last_seen_at` (7 days of inactivity) are both within range, judged in SQL
 * against the database clock.
 */
@Entity({ name: 'auth_sessions' })
@Check('chk_auth_sessions_expiry', `"expires_at" > "created_at"`)
export class AuthSession {
  /** Hex SHA-256 of the cookie token. */
  @PrimaryColumn({ name: 'id', type: 'text' })
  id!: string;

  @Index('idx_auth_sessions_user')
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_auth_sessions_user' })
  user?: User;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'last_seen_at', type: 'timestamptz', default: () => 'now()' })
  lastSeenAt!: Date;

  @Index('idx_auth_sessions_expires')
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;
}
