import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1789646863673 implements MigrationInterface {
  name = 'InitialSchema1789646863673';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // TypeORM does not create extensions (installExtensions: false); users.username needs citext.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS citext`);
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "username" citext NOT NULL, "password_hash" text NOT NULL, "timezone" text NOT NULL DEFAULT 'UTC', "locale" text NOT NULL DEFAULT 'en', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE ("username"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "auth_sessions" ("id" text NOT NULL, "user_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "last_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "chk_auth_sessions_expiry" CHECK ("expires_at" > "created_at"), CONSTRAINT "PK_641507381f32580e8479efc36cd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_auth_sessions_user" ON "auth_sessions"  ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_auth_sessions_expires" ON "auth_sessions"  ("expires_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "programming_languages" ("id" integer NOT NULL, "slug" text NOT NULL, "display_name" text NOT NULL, "sort_order" smallint NOT NULL, "enabled" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_70c71b9557e2a5d1bd062d4c222" UNIQUE ("slug"), CONSTRAINT "chk_programming_languages_slug" CHECK ("slug" ~ '^[a-z][a-z0-9-]*$'), CONSTRAINT "PK_58f44cc8ad093d3eb106a84f290" PRIMARY KEY ("id"))`,
    );
    // Fixed ids, so every environment agrees; slugs match ContentLanguage in contracts.
    await queryRunner.query(
      `INSERT INTO "programming_languages" ("id", "slug", "display_name", "sort_order") VALUES (1, 'typescript', 'TypeScript', 1), (2, 'go', 'Go', 2), (3, 'java', 'Java', 3), (4, 'python', 'Python', 4)`,
    );
    await queryRunner.query(`CREATE TABLE "play_sessions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "mode" text NOT NULL, "language_id" integer NOT NULL, "duration_sec" integer NOT NULL DEFAULT '120', "started_at" TIMESTAMP WITH TIME ZONE NOT NULL, "timezone" text NOT NULL, "local_date" date NOT NULL, "local_week_start" date NOT NULL, "raw_keystrokes" integer NOT NULL, "effective_keystrokes" integer NOT NULL, "miss_count" integer NOT NULL, "kpm" numeric(7,2) NOT NULL, "accuracy" numeric(5,4) NOT NULL, "score" integer NOT NULL, "cpu_level" integer, "ghost_period" text, "opponent_score" integer, "result" text, "rng_seed" bigint NOT NULL, "content_revision" text NOT NULL, "app_version" text NOT NULL, CONSTRAINT "chk_play_sessions_week_start" CHECK (EXTRACT(DOW FROM "local_week_start") = 0), CONSTRAINT "chk_play_sessions_counts" CHECK ("duration_sec" > 0 AND "raw_keystrokes" >= 0 AND "effective_keystrokes" >= 0
   AND "miss_count" >= 0 AND "kpm" >= 0 AND "accuracy" BETWEEN 0 AND 1 AND "score" >= 0
   AND ("opponent_score" IS NULL OR "opponent_score" >= 0)), CONSTRAINT "chk_play_sessions_opponent" CHECK (("mode" = 'single' AND "cpu_level" IS NULL AND "ghost_period" IS NULL
     AND "opponent_score" IS NULL AND "result" IS NULL)
   OR ("mode" = 'cpu' AND "cpu_level" IS NOT NULL AND "cpu_level" BETWEEN 1 AND 100
     AND "ghost_period" IS NULL AND "opponent_score" IS NOT NULL
     AND "result" IS NOT NULL AND "result" IN ('win', 'lose'))
   OR ("mode" = 'ghost' AND "cpu_level" IS NULL AND "ghost_period" IS NOT NULL
     AND "ghost_period" IN ('daily', 'weekly', 'total') AND "opponent_score" IS NOT NULL
     AND "result" IS NOT NULL AND "result" IN ('win', 'lose'))), CONSTRAINT "chk_play_sessions_mode" CHECK ("mode" IN ('single', 'cpu', 'ghost')), CONSTRAINT "PK_b3d16c71ba90587b743cae04c63" PRIMARY KEY ("id"))`);
    await queryRunner.query(
      `CREATE INDEX "idx_sessions_conquest" ON "play_sessions"  ("user_id", "language_id", "cpu_level") WHERE "mode" = 'cpu' AND "result" = 'win'`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sessions_alltime" ON "play_sessions"  ("user_id", "language_id", "score") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sessions_weekly" ON "play_sessions"  ("user_id", "language_id", "local_week_start", "score") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sessions_daily" ON "play_sessions"  ("user_id", "language_id", "local_date", "score") `,
    );
    await queryRunner.query(
      `ALTER TABLE "auth_sessions" ADD CONSTRAINT "fk_auth_sessions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "play_sessions" ADD CONSTRAINT "fk_play_sessions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "play_sessions" ADD CONSTRAINT "fk_play_sessions_language" FOREIGN KEY ("language_id") REFERENCES "programming_languages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "play_sessions" DROP CONSTRAINT "fk_play_sessions_language"`,
    );
    await queryRunner.query(`ALTER TABLE "play_sessions" DROP CONSTRAINT "fk_play_sessions_user"`);
    await queryRunner.query(`ALTER TABLE "auth_sessions" DROP CONSTRAINT "fk_auth_sessions_user"`);
    await queryRunner.query(`DROP INDEX "public"."idx_sessions_daily"`);
    await queryRunner.query(`DROP INDEX "public"."idx_sessions_weekly"`);
    await queryRunner.query(`DROP INDEX "public"."idx_sessions_alltime"`);
    await queryRunner.query(`DROP INDEX "public"."idx_sessions_conquest"`);
    await queryRunner.query(`DROP TABLE "play_sessions"`);
    await queryRunner.query(`DROP TABLE "programming_languages"`);
    await queryRunner.query(`DROP INDEX "public"."idx_auth_sessions_expires"`);
    await queryRunner.query(`DROP INDEX "public"."idx_auth_sessions_user"`);
    await queryRunner.query(`DROP TABLE "auth_sessions"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS citext`);
  }
}
