import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

import { ContentLibrary } from './content-library';

/**
 * Keeps the languages table and the content bundles in agreement: every enabled language needs a
 * bundle, and every bundle needs a language row. A disabled language may keep its bundle.
 */
@Injectable()
export class ContentConsistency implements OnApplicationBootstrap {
  private readonly logger = new Logger(ContentConsistency.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(ContentLibrary) private readonly library: ContentLibrary,
  ) {}

  /** Every disagreement, empty when there is none. */
  async findProblems(): Promise<string[]> {
    const rows = await this.dataSource.query<{ slug: string; enabled: boolean }[]>(
      'SELECT slug, enabled FROM programming_languages ORDER BY slug',
    );
    const problems: string[] = [];
    for (const { slug, enabled } of rows) {
      if (enabled && !this.library.has(slug)) {
        problems.push(`language "${slug}" is enabled but has no content bundle`);
      }
    }
    const known = new Set(rows.map((row) => row.slug));
    for (const language of this.library.languages) {
      if (!known.has(language)) {
        problems.push(`content bundle "${language}" has no programming_languages row`);
      }
    }
    return problems;
  }

  /**
   * Serving content that disagrees with the database is worse than not starting (§5.2). With
   * migrations pending the languages table may not exist yet; the application then starts so that
   * readiness can report the pending migrations, and this check is left to readiness too.
   */
  async onApplicationBootstrap(): Promise<void> {
    if (await this.dataSource.showMigrations()) {
      this.logger.warn('migrations are pending; the content check is left to readiness');
      return;
    }
    const problems = await this.findProblems();
    if (problems.length > 0) {
      throw new Error(`content does not match the languages table:\n- ${problems.join('\n- ')}`);
    }
  }
}
