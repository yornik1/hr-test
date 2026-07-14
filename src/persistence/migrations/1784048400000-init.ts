import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1784048400000 implements MigrationInterface {
  name = 'Init1784048400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id text NOT NULL,
        email text NOT NULL,
        password_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT users_brand_email_uq UNIQUE (brand_id, email)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        brand_id text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz
      )
    `);
    await queryRunner.query(`CREATE INDEX sessions_user_id_idx ON sessions (user_id)`);

    await queryRunner.query(`
      CREATE TABLE raw_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id text NOT NULL,
        source text NOT NULL,
        provider text NOT NULL,
        event_type text,
        external_id text NOT NULL,
        payload jsonb NOT NULL,
        correlation_id text,
        received_at timestamptz NOT NULL DEFAULT now(),
        processed_at timestamptz
      )
    `);
    await queryRunner.query(
      `CREATE INDEX raw_events_brand_received_idx ON raw_events (brand_id, received_at)`,
    );

    await queryRunner.query(`
      CREATE TABLE idempotency_keys (
        brand_id text NOT NULL,
        scope text NOT NULL,
        key text NOT NULL,
        raw_event_id uuid NOT NULL REFERENCES raw_events (id),
        first_seen_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT idempotency_keys_pk PRIMARY KEY (brand_id, scope, key)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE idempotency_keys`);
    await queryRunner.query(`DROP TABLE raw_events`);
    await queryRunner.query(`DROP TABLE sessions`);
    await queryRunner.query(`DROP TABLE users`);
  }
}
