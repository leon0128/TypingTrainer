import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Turns on the six natural-language pools (§13). They were added disabled, because listing them
 * earlier would have shown them among the code languages on screens that could not play them. The
 * API serves them, refuses Japanese to accounts whose display language is not Japanese, and the
 * web has the track screens and the play views, so they are safe to list now. An enabled pool whose
 * bundle is missing stops the API from starting, so a deployment without the bundles fails at once
 * rather than offering a pool that cannot be played.
 */
export class EnableNaturalLanguagePools1790300000000 implements MigrationInterface {
  name = 'EnableNaturalLanguagePools1790300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "languages" SET "enabled" = true WHERE "track" <> 'code'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "languages" SET "enabled" = false WHERE "track" <> 'code'`);
  }
}
