import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export function isSqlConfigured(): boolean {
  return Boolean(
    process.env.DATABASE_URL?.trim() ||
      (process.env.SQL_HOST?.trim() && process.env.SQL_DB_NAME?.trim()),
  );
}

export const createPool = () => {
  if (!global._postgresPool) {
    const connectionString = process.env.DATABASE_URL?.trim();
    const isRemoteUrl = Boolean(
      connectionString && !/localhost|127\.0\.0\.1/i.test(connectionString),
    );

    global._postgresPool = connectionString
      ? new Pool({
          connectionString,
          ssl: isRemoteUrl ? { rejectUnauthorized: false } : false,
          max: 10,
          connectionTimeoutMillis: 10000,
        })
      : new Pool({
          host: process.env.SQL_HOST,
          user: process.env.SQL_USER,
          password: process.env.SQL_PASSWORD,
          database: process.env.SQL_DB_NAME,
          max: 10,
          connectionTimeoutMillis: 10000,
        });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();
export const db = drizzle(pool, { schema });
