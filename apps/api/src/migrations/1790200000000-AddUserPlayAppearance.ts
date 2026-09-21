import type { MigrationInterface, QueryRunner } from 'typeorm';

const FONT_CHECK = `("track" = 'natural-ja' AND "font" IN ('m-plus-1-code', 'biz-ud-gothic')) OR ("track" <> 'natural-ja' AND "font" IN ('jetbrains-mono', 'fira-code', 'source-code-pro', 'ibm-plex-mono', 'noto-sans-mono'))`;

/**
 * The play screen's font, size, and colour set move from one row per user to one row per user and
 * track (§13.10). What an account had chosen becomes its code track's look; the other tracks start
 * from their defaults. The old columns are dropped, the service being in maintenance.
 */
export class AddUserPlayAppearance1790200000000 implements MigrationInterface {
  name = 'AddUserPlayAppearance1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "user_play_appearance" ("user_id" uuid NOT NULL, "track" text NOT NULL, "font" text NOT NULL, "font_size" smallint NOT NULL, "color_preset" text NOT NULL, CONSTRAINT "chk_user_play_appearance_color_preset" CHECK ("color_preset" IN ('standard', 'okabe-ito', 'monochrome')), CONSTRAINT "chk_user_play_appearance_font_size" CHECK ("font_size" IN (14, 16, 18, 20, 24)), CONSTRAINT "chk_user_play_appearance_font" CHECK (${FONT_CHECK}), CONSTRAINT "chk_user_play_appearance_track" CHECK ("track" IN ('code', 'natural-ja', 'natural-en')), CONSTRAINT "PK_596fbf1cc4eae6af068d1a40360" PRIMARY KEY ("user_id", "track"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_play_appearance" ADD CONSTRAINT "fk_user_play_appearance_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `INSERT INTO "user_play_appearance" ("user_id", "track", "font", "font_size", "color_preset")
       SELECT "user_id", 'code', "font", "font_size", "color_preset" FROM "user_preferences"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_preferences" DROP CONSTRAINT "chk_user_preferences_font"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_preferences" DROP CONSTRAINT "chk_user_preferences_font_size"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_preferences" DROP CONSTRAINT "chk_user_preferences_color_preset"`,
    );
    await queryRunner.query(`ALTER TABLE "user_preferences" DROP COLUMN "font"`);
    await queryRunner.query(`ALTER TABLE "user_preferences" DROP COLUMN "font_size"`);
    await queryRunner.query(`ALTER TABLE "user_preferences" DROP COLUMN "color_preset"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_preferences" ADD "font" text NOT NULL DEFAULT 'jetbrains-mono'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_preferences" ADD "font_size" smallint NOT NULL DEFAULT '18'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_preferences" ADD "color_preset" text NOT NULL DEFAULT 'standard'`,
    );
    await queryRunner.query(
      `UPDATE "user_preferences" p SET "font" = a."font", "font_size" = a."font_size", "color_preset" = a."color_preset"
       FROM "user_play_appearance" a WHERE a."user_id" = p."user_id" AND a."track" = 'code'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_preferences" ADD CONSTRAINT "chk_user_preferences_font" CHECK ("font" IN ('jetbrains-mono', 'fira-code', 'source-code-pro', 'ibm-plex-mono', 'noto-sans-mono'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_preferences" ADD CONSTRAINT "chk_user_preferences_font_size" CHECK ("font_size" IN (14, 16, 18, 20, 24))`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_preferences" ADD CONSTRAINT "chk_user_preferences_color_preset" CHECK ("color_preset" IN ('standard', 'okabe-ito', 'monochrome'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_play_appearance" DROP CONSTRAINT "fk_user_play_appearance_user"`,
    );
    await queryRunner.query(`DROP TABLE "user_play_appearance"`);
  }
}
