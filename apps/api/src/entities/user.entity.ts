import { Check, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * An account (§7, §9.3). The username check mirrors UsernameSchema in contracts; a test keeps the
 * two in agreement. On citext, `~` matches case-insensitively, which this character class allows.
 */
@Entity({ name: 'users' })
@Check(
  'chk_users_username',
  `char_length("username") BETWEEN 3 AND 24 AND "username" ~ '^[A-Za-z0-9][A-Za-z0-9_-]*$'`,
)
export class User {
  /** DEFAULT gen_random_uuid(), given uuidExtension 'pgcrypto' in the data source options. */
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  /** citext, so `Alice` and `alice` are the same account. */
  @Column({ name: 'username', type: 'citext', unique: true })
  username!: string;

  @Column({ name: 'password_hash', type: 'text' })
  passwordHash!: string;

  /** IANA time zone name; fixes day and week boundaries for aggregates (§6.4). */
  @Column({ name: 'timezone', type: 'text', default: 'UTC' })
  timezone!: string;

  @Column({ name: 'locale', type: 'text', default: 'en' })
  locale!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
