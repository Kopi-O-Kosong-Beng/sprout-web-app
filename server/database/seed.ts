/** Runs seed files: `npm run seed` */
import db from './db';

db.seed
  .run()
  .then(([files]: [string[]]) => {
    console.log(`Ran ${files.length} seed file(s)`);
    files.forEach((f) => console.log(`  - ${f}`));
    return db.destroy();
  })
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
