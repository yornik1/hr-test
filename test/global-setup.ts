import { Client } from 'pg';
import { DataSource } from 'typeorm';

// creates the e2e database if needed and brings it to the latest migration
export default async function globalSetup(): Promise<void> {
  const url = process.env.DATABASE_URL_E2E ?? 'postgres://hr:hr@localhost:5432/hr_test_e2e';

  const parsed = new URL(url);
  const dbName = parsed.pathname.slice(1);
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${dbName}"`);
  }
  await admin.end();

  const ds = new DataSource({
    type: 'postgres',
    url,
    migrations: [__dirname + '/../src/persistence/migrations/*.ts'],
  });
  await ds.initialize();
  await ds.runMigrations();
  await ds.destroy();
}
