import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSoundPreferences1789905782719 implements MigrationInterface {
  name = 'AddSoundPreferences1789905782719';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_preferences" ADD "sound_pack" text NOT NULL DEFAULT 'off'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_preferences" ADD "sound_volume" smallint NOT NULL DEFAULT '30'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_preferences" ADD CONSTRAINT "chk_user_preferences_sound_volume" CHECK ("sound_volume" BETWEEN 0 AND 100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_preferences" ADD CONSTRAINT "chk_user_preferences_sound_pack" CHECK ("sound_pack" IN ('off', 'mechanical', 'soft', 'beep'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_preferences" DROP CONSTRAINT "chk_user_preferences_sound_pack"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_preferences" DROP CONSTRAINT "chk_user_preferences_sound_volume"`,
    );
    await queryRunner.query(`ALTER TABLE "user_preferences" DROP COLUMN "sound_volume"`);
    await queryRunner.query(`ALTER TABLE "user_preferences" DROP COLUMN "sound_pack"`);
  }
}
