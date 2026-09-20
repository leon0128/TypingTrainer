import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGhostToIssuedRuns1789905002284 implements MigrationInterface {
  name = 'AddGhostToIssuedRuns1789905002284';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "issued_runs" DROP CONSTRAINT "chk_issued_runs_cpu_level"`,
    );
    await queryRunner.query(`ALTER TABLE "issued_runs" ADD "ghost_period" text`);
    await queryRunner.query(`ALTER TABLE "issued_runs" ADD "ghost_score" integer`);
    await queryRunner.query(`ALTER TABLE "issued_runs" ADD CONSTRAINT "chk_issued_runs_opponent" CHECK (("mode" = 'single' AND "cpu_level" IS NULL AND "ghost_period" IS NULL AND "ghost_score" IS NULL)
   OR ("mode" = 'cpu' AND "cpu_level" IS NOT NULL AND "cpu_level" BETWEEN 1 AND 100
       AND "ghost_period" IS NULL AND "ghost_score" IS NULL)
   OR ("mode" = 'ghost' AND "cpu_level" IS NULL AND "ghost_period" IS NOT NULL
       AND "ghost_period" IN ('daily', 'weekly', 'total')
       AND "ghost_score" IS NOT NULL AND "ghost_score" >= 1))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "issued_runs" DROP CONSTRAINT "chk_issued_runs_opponent"`);
    await queryRunner.query(`ALTER TABLE "issued_runs" DROP COLUMN "ghost_score"`);
    await queryRunner.query(`ALTER TABLE "issued_runs" DROP COLUMN "ghost_period"`);
    await queryRunner.query(
      `ALTER TABLE "issued_runs" ADD CONSTRAINT "chk_issued_runs_cpu_level" CHECK ((((mode = 'cpu'::text) AND (cpu_level IS NOT NULL) AND ((cpu_level >= 1) AND (cpu_level <= 100))) OR ((mode <> 'cpu'::text) AND (cpu_level IS NULL))))`,
    );
  }
}
