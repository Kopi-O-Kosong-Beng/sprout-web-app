require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const path = require('path');

// SQLite for localhost dev (Task 2). WAL mode per task 2.2.
// DB_FILENAME can be overridden (tests point it at a throwaway file).
module.exports = {
  client: 'better-sqlite3',
  connection: {
    filename: process.env.DB_FILENAME
      ? path.resolve(__dirname, process.env.DB_FILENAME)
      : path.join(__dirname, 'database', 'sprout.dev.sqlite3'),
  },
  useNullAsDefault: true,
  migrations: { directory: path.join(__dirname, 'database', 'migrations') },
  seeds: { directory: path.join(__dirname, 'database', 'seeds') },
  pool: {
    afterCreate: (conn, done) => {
      conn.pragma('journal_mode = WAL');
      done(null, conn);
    },
  },
};
