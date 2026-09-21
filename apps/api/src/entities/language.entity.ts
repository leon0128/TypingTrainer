import { Check, Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * A pool a run can be drawn from (§9.3, §13.1): a programming language, or a kind of
 * natural-language text. Rows are seeded by migrations with fixed ids, so ids agree across every
 * environment; the slug equals the content bundle's name (ContentLanguage), and `track` and `kind`
 * repeat what `POOLS` in contracts says, which ContentConsistency checks at startup.
 */
@Entity({ name: 'languages' })
@Check('chk_languages_slug', `"slug" ~ '^[a-z][a-z0-9-]*$'`)
@Check('chk_languages_track', `"track" IN ('code', 'natural-ja', 'natural-en')`)
// Every comparison on the nullable `kind` is paired with IS NOT NULL: `NULL IN (...)` is NULL, and
// a CHECK constraint only rejects false.
@Check(
  'chk_languages_kind',
  `("track" = 'code' AND "kind" IS NULL) OR ("track" <> 'code' AND "kind" IS NOT NULL AND "kind" IN ('word', 'line', 'paragraph'))`,
)
export class Language {
  @PrimaryColumn({ name: 'id', type: 'int' })
  id!: number;

  @Column({ name: 'slug', type: 'text', unique: true })
  slug!: string;

  @Column({ name: 'display_name', type: 'text' })
  displayName!: string;

  @Column({ name: 'sort_order', type: 'smallint' })
  sortOrder!: number;

  @Column({ name: 'enabled', type: 'boolean', default: true })
  enabled!: boolean;

  /** `code`, `natural-ja`, or `natural-en`: which track the pool belongs to. */
  @Column({ name: 'track', type: 'text' })
  track!: string;

  /** `word`, `line`, or `paragraph` for a natural-language pool; null for a programming language. */
  @Column({ name: 'kind', type: 'text', nullable: true })
  kind!: string | null;
}
