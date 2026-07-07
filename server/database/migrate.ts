/** Runs pending migrations: `npm run migrate` */
import db from './db';

db.migrate
  .latest()
  .then(([batch, files]: [number, string[]]) => {
    if (files.length === 0) {
      console.log('Already up to date.');
    } else {
      console.log(`Batch ${batch} run: ${files.length} migration(s)`);
      files.forEach((f) => console.log(`  - ${f}`));
    }
    return db.destroy();
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
