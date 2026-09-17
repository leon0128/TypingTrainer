import { Check, Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * A language that can be played (§9.3). Rows are seeded by migrations with fixed ids, so ids agree
 * across every environment; the slug equals the content bundle's language (ContentLanguage).
 */
@Entity({ name: 'programming_languages' })
@Check('chk_programming_languages_slug', `"slug" ~ '^[a-z][a-z0-9-]*$'`)
export class ProgrammingLanguage {
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
}
