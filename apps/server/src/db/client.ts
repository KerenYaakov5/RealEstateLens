import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import pg from 'pg';
import type { Logger } from '../lib/logger.js';
import * as schema from './schema.js';

export type Schema = typeof schema;
export type Database = PgDatabase<PgQueryResultHKT, Schema>;

export interface DatabaseHandle {
  db: Database;
  kind: 'postgres' | 'pglite';
  migrate(): Promise<void>;
  close(): Promise<void>;
}

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../drizzle',
);

export interface DatabaseOptions {
  /** Postgres connection string. When missing, an embedded PGlite database is used. */
  databaseUrl?: string | undefined;
  /** PGlite data directory; `memory://` gives a throwaway in-memory database. */
  pgliteDataDir: string;
  logger: Logger;
}

export function createDatabase(options: DatabaseOptions): DatabaseHandle {
  if (options.databaseUrl !== undefined) {
    // Bounded waits: an unreachable database fails a request within seconds (503) instead of
    // leaving it hanging – pg's default connection timeout is "wait forever".
    const pool = new pg.Pool({
      connectionString: options.databaseUrl,
      max: 10,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 15_000,
    });
    pool.on('error', (err) => {
      options.logger.error({ err }, 'Postgres pool error');
    });
    const db = drizzleNodePg(pool, { schema });
    return {
      db,
      kind: 'postgres',
      migrate: async () => {
        await migrateNodePg(db, { migrationsFolder });
      },
      close: async () => {
        await pool.end();
      },
    };
  }

  const client = new PGlite(options.pgliteDataDir);
  const db = drizzlePglite(client, { schema });
  return {
    db,
    kind: 'pglite',
    migrate: async () => {
      await migratePglite(db, { migrationsFolder });
    },
    close: async () => {
      await client.close();
    },
  };
}
