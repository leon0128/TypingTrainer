import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLocaleCheck1789902462677 implements MigrationInterface {
  name = 'AddLocaleCheck1789902462677';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "chk_users_locale" CHECK ("locale" IN ('en', 'ja'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "chk_users_locale"`);
  }
}
