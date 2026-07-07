/** Knex config — SQLite fallback datastore (Task 2). WAL mode per task 2.2.
 *  DB_FILENAME can be overridden (tests point it at a throwaway file). */
import './env';
import path from 'path';
import type { Knex } from 'knex';

const config: Knex.Config = {
  client: 'better-sqlite3',
  connection: {
    filename: process.env.DB_FILENAME
      ? path.resolve(__dirname, process.env.DB_FILENAME)
      : path.join(__dirname, 'database', 'sprout.dev.sqlite3'),
  },
  useNullAsDefault: true,
  migrations: {
    directory: path.join(__dirname, 'database', 'migrations'),
    extension: 'ts',
    loadExtensions: ['.ts'],
  },
  seeds: {
    directory: path.join(__dirname, 'database', 'seeds'),
    extension: 'ts',
    loadExtensions: ['.ts'],
  },
  pool: {
    // better-sqlite3 connection object; knex types this loosely
    afterCreate: (conn: { pragma: (s: string) => void }, done: (err: Error | null, conn: unknown) => void) => {
      conn.pragma('journal_mode = WAL');
      done(null, conn);
    },
  },
};

export default config;
