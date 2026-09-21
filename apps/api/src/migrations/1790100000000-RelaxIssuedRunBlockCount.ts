import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A run of a natural-language pool takes 300, 80, or 20 blocks by the kind of text (§13.7), not
 * always 20, so the CHECK bounds the count instead of fixing it. The exact number stays with the
 * service (`runBlockCount`), which knows the pool; the database cannot join `languages` in a CHECK.
 */
export class RelaxIssuedRunBlockCount1790100000000 implements MigrationInterface {
  name = 'RelaxIssuedRunBlockCount1790100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "issued_runs" DROP CONSTRAINT "chk_issued_runs_blocks"`);
    await queryRunner.query(
      `ALTER TABLE "issued_runs" ADD CONSTRAINT "chk_issued_runs_blocks" CHECK (cardinality("block_ids") BETWEEN 1 AND 300)`,
    );
  }

  /** Only valid while no run of a natural-language pool has been issued: a row with more or fewer than 20 blocks would violate the old CHECK. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "issued_runs" DROP CONSTRAINT "chk_issued_runs_blocks"`);
    await queryRunner.query(
      `ALTER TABLE "issued_runs" ADD CONSTRAINT "chk_issued_runs_blocks" CHECK (cardinality("block_ids") = 20)`,
    );
  }
}
