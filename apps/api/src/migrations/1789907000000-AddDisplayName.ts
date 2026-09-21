import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDisplayName1789907000000 implements MigrationInterface {
  name = 'AddDisplayName1789907000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "display_name" text`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "chk_users_display_name" CHECK ("display_name" IS NULL OR char_length("display_name") BETWEEN 1 AND 24)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "chk_users_display_name"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "display_name"`);
  }
}
