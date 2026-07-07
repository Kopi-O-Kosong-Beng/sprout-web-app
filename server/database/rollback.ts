/** Rolls back the latest migration batch: `npm run migrate:rollback` */
import db from './db';

db.migrate
  .rollback()
  .then(([batch, files]: [number, string[]]) => {
    console.log(`Rolled back batch ${batch}: ${files.length} migration(s)`);
    files.forEach((f) => console.log(`  - ${f}`));
    return db.destroy();
  })
  .catch((err) => {
    console.error('Rollback failed:', err);
    process.exit(1);
  });
