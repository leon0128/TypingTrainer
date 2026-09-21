import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSkinPreference1789906000000 implements MigrationInterface {
  name = 'AddSkinPreference1789906000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_preferences" ADD "skin" text NOT NULL DEFAULT 'classic'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_preferences" ADD CONSTRAINT "chk_user_preferences_skin" CHECK ("skin" IN ('classic', 'neon', 'pixel', 'fantasy', 'pop'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_preferences" DROP CONSTRAINT "chk_user_preferences_skin"`,
    );
    await queryRunner.query(`ALTER TABLE "user_preferences" DROP COLUMN "skin"`);
  }
}
