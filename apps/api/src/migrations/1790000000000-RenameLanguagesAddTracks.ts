import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Natural-language tracks (§13.2): `programming_languages` becomes `languages`, since a row is now
 * also a kind of Japanese or English text, and gains the track and kind that say which.
 *
 * TypeORM names a primary key and a unique constraint from the table name, so both are renamed to
 * the names it now expects (the same hash the initial migration used, of the new table name);
 * foreign keys have explicit names and follow the table by themselves.
 *
 * The six natural-language pools are inserted disabled. An enabled language without a content
 * bundle stops the API from starting (ContentConsistency), and enabling them belongs with the
 * locale check that keeps Japanese from other accounts, so a later migration turns them on.
 */
export class RenameLanguagesAddTracks1790000000000 implements MigrationInterface {
  name = 'RenameLanguagesAddTracks1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "programming_languages" RENAME TO "languages"`);
    await queryRunner.query(
      `ALTER TABLE "languages" RENAME CONSTRAINT "PK_58f44cc8ad093d3eb106a84f290" TO "PK_b517f827ca496b29f4d549c631d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "languages" RENAME CONSTRAINT "UQ_70c71b9557e2a5d1bd062d4c222" TO "UQ_6a6bfd1fd58d167d3f84d16eefe"`,
    );
    await queryRunner.query(
      `ALTER TABLE "languages" RENAME CONSTRAINT "chk_programming_languages_slug" TO "chk_languages_slug"`,
    );
    // Every existing row is a programming language; the default only fills them and is dropped, so
    // a new row has to say which track it is on.
    await queryRunner.query(`ALTER TABLE "languages" ADD "track" text NOT NULL DEFAULT 'code'`);
    await queryRunner.query(`ALTER TABLE "languages" ALTER COLUMN "track" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "languages" ADD "kind" text`);
    await queryRunner.query(
      `ALTER TABLE "languages" ADD CONSTRAINT "chk_languages_track" CHECK ("track" IN ('code', 'natural-ja', 'natural-en'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "languages" ADD CONSTRAINT "chk_languages_kind" CHECK (("track" = 'code' AND "kind" IS NULL) OR ("track" <> 'code' AND "kind" IS NOT NULL AND "kind" IN ('word', 'line', 'paragraph')))`,
    );
    await queryRunner.query(
      `INSERT INTO "languages" ("id", "slug", "display_name", "sort_order", "enabled", "track", "kind") VALUES (5, 'ja-word', 'Japanese words', 5, false, 'natural-ja', 'word'), (6, 'ja-line', 'Japanese sentences', 6, false, 'natural-ja', 'line'), (7, 'ja-paragraph', 'Japanese paragraphs', 7, false, 'natural-ja', 'paragraph'), (8, 'en-word', 'English words', 8, false, 'natural-en', 'word'), (9, 'en-line', 'English sentences', 9, false, 'natural-en', 'line'), (10, 'en-paragraph', 'English paragraphs', 10, false, 'natural-en', 'paragraph')`,
    );
  }

  /**
   * Only valid while no run, rating, or issued run refers to a natural-language pool: their rows
   * would keep the six languages from being deleted.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "languages" WHERE "id" BETWEEN 5 AND 10`);
    await queryRunner.query(`ALTER TABLE "languages" DROP CONSTRAINT "chk_languages_kind"`);
    await queryRunner.query(`ALTER TABLE "languages" DROP CONSTRAINT "chk_languages_track"`);
    await queryRunner.query(`ALTER TABLE "languages" DROP COLUMN "kind"`);
    await queryRunner.query(`ALTER TABLE "languages" DROP COLUMN "track"`);
    await queryRunner.query(
      `ALTER TABLE "languages" RENAME CONSTRAINT "chk_languages_slug" TO "chk_programming_languages_slug"`,
    );
    await queryRunner.query(
      `ALTER TABLE "languages" RENAME CONSTRAINT "UQ_6a6bfd1fd58d167d3f84d16eefe" TO "UQ_70c71b9557e2a5d1bd062d4c222"`,
    );
    await queryRunner.query(
      `ALTER TABLE "languages" RENAME CONSTRAINT "PK_b517f827ca496b29f4d549c631d" TO "PK_58f44cc8ad093d3eb106a84f290"`,
    );
    await queryRunner.query(`ALTER TABLE "languages" RENAME TO "programming_languages"`);
  }
}
