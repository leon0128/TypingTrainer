import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIssuedRuns1789823131650 implements MigrationInterface {
  name = 'AddIssuedRuns1789823131650';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "issued_runs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "language_id" integer NOT NULL, "mode" text NOT NULL, "rng_seed" bigint NOT NULL, "content_revision" text NOT NULL, "block_ids" text array NOT NULL, "issued_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "submitted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "chk_issued_runs_submitted" CHECK ("submitted_at" IS NULL OR "submitted_at" >= "issued_at"), CONSTRAINT "chk_issued_runs_blocks" CHECK (cardinality("block_ids") = 20), CONSTRAINT "chk_issued_runs_mode" CHECK ("mode" IN ('single', 'cpu', 'ghost')), CONSTRAINT "PK_c004fe19746395b5f6983bf1e8f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_issued_runs_user" ON "issued_runs"  ("user_id", "issued_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "issued_runs" ADD CONSTRAINT "fk_issued_runs_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "issued_runs" ADD CONSTRAINT "fk_issued_runs_language" FOREIGN KEY ("language_id") REFERENCES "programming_languages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "issued_runs" DROP CONSTRAINT "fk_issued_runs_language"`);
    await queryRunner.query(`ALTER TABLE "issued_runs" DROP CONSTRAINT "fk_issued_runs_user"`);
    await queryRunner.query(`DROP INDEX "public"."idx_issued_runs_user"`);
    await queryRunner.query(`DROP TABLE "issued_runs"`);
  }
}
