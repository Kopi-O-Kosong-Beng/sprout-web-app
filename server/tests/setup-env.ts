/** Jest setupFile — runs BEFORE test modules are imported, so env vars are in
 *  place when knexfile/repositories evaluate (imports are hoisted; setting
 *  process.env inside a test file would be too late). */
process.env.DATASTORE = 'sqlite';
process.env.DB_FILENAME = './database/sprout.test.sqlite3';
process.env.EMAIL_MODE = 'console';
process.env.NODE_ENV = 'test';
process.env.BCRYPT_COST = '4';
