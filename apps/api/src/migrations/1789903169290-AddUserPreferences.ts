import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserPreferences1789903169290 implements MigrationInterface {
  name = 'AddUserPreferences1789903169290';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "user_preferences" ("user_id" uuid NOT NULL, "font" text NOT NULL DEFAULT 'jetbrains-mono', "font_size" smallint NOT NULL DEFAULT '18', "theme" text NOT NULL DEFAULT 'system', "color_preset" text NOT NULL DEFAULT 'standard', CONSTRAINT "chk_user_preferences_color_preset" CHECK ("color_preset" IN ('standard', 'okabe-ito', 'monochrome')), CONSTRAINT "chk_user_preferences_theme" CHECK ("theme" IN ('system', 'light', 'dark', 'high-contrast')), CONSTRAINT "chk_user_preferences_font_size" CHECK ("font_size" IN (14, 16, 18, 20, 24)), CONSTRAINT "chk_user_preferences_font" CHECK ("font" IN ('jetbrains-mono', 'fira-code', 'source-code-pro', 'ibm-plex-mono', 'noto-sans-mono')), CONSTRAINT "PK_458057fa75b66e68a275647da2e" PRIMARY KEY ("user_id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_preferences" ADD CONSTRAINT "fk_user_preferences_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_preferences" DROP CONSTRAINT "fk_user_preferences_user"`,
    );
    await queryRunner.query(`DROP TABLE "user_preferences"`);
  }
}
