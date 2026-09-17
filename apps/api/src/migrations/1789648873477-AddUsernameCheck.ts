import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUsernameCheck1789648873477 implements MigrationInterface {
  name = 'AddUsernameCheck1789648873477';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "chk_users_username" CHECK (char_length("username") BETWEEN 3 AND 24 AND "username" ~ '^[A-Za-z0-9][A-Za-z0-9_-]*$')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "chk_users_username"`);
  }
}
