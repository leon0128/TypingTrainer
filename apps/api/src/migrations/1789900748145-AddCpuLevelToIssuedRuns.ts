import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCpuLevelToIssuedRuns1789900748145 implements MigrationInterface {
  name = 'AddCpuLevelToIssuedRuns1789900748145';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "issued_runs" ADD "cpu_level" smallint`);
    await queryRunner.query(
      `ALTER TABLE "issued_runs" ADD CONSTRAINT "chk_issued_runs_cpu_level" CHECK (("mode" = 'cpu' AND "cpu_level" IS NOT NULL AND "cpu_level" BETWEEN 1 AND 100) OR ("mode" <> 'cpu' AND "cpu_level" IS NULL))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "issued_runs" DROP CONSTRAINT "chk_issued_runs_cpu_level"`,
    );
    await queryRunner.query(`ALTER TABLE "issued_runs" DROP COLUMN "cpu_level"`);
  }
}
