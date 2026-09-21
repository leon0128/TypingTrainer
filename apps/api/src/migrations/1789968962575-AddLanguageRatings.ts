import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLanguageRatings1789968962575 implements MigrationInterface {
  name = 'AddLanguageRatings1789968962575';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "language_ratings" ("user_id" uuid NOT NULL, "language_id" integer NOT NULL, "rating" integer NOT NULL DEFAULT '0', "games_played" integer NOT NULL DEFAULT '0', CONSTRAINT "chk_language_ratings_games" CHECK ("games_played" >= 0), CONSTRAINT "chk_language_ratings_rating" CHECK ("rating" BETWEEN 0 AND 2000), CONSTRAINT "PK_b5b0403d210f5a405f8825572ca" PRIMARY KEY ("user_id", "language_id"))`,
    );
    await queryRunner.query(`ALTER TABLE "issued_runs" ADD "rating_before" integer`);
    await queryRunner.query(`ALTER TABLE "issued_runs" ADD "games_before" integer`);
    await queryRunner.query(`ALTER TABLE "issued_runs" ADD "rating_charged" integer`);
    await queryRunner.query(
      `ALTER TABLE "language_ratings" ADD CONSTRAINT "fk_language_ratings_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "language_ratings" ADD CONSTRAINT "fk_language_ratings_language" FOREIGN KEY ("language_id") REFERENCES "programming_languages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "language_ratings" DROP CONSTRAINT "fk_language_ratings_language"`,
    );
    await queryRunner.query(
      `ALTER TABLE "language_ratings" DROP CONSTRAINT "fk_language_ratings_user"`,
    );
    await queryRunner.query(`ALTER TABLE "issued_runs" DROP COLUMN "rating_charged"`);
    await queryRunner.query(`ALTER TABLE "issued_runs" DROP COLUMN "games_before"`);
    await queryRunner.query(`ALTER TABLE "issued_runs" DROP COLUMN "rating_before"`);
    await queryRunner.query(`DROP TABLE "language_ratings"`);
  }
}
