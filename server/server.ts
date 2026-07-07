/** Entry point — tasks.md 9.6: run migrations (SQLite mode), then listen. */
import app from './app';
import db from './database/db';

const PORT = Number(process.env.PORT ?? 3001);
const DATASTORE = process.env.DATASTORE ?? 'sqlite';

async function start(): Promise<void> {
  if (DATASTORE === 'sqlite') {
    await db.migrate.latest();
  }
  app.listen(PORT, () => {
    console.log(`Sprout backend listening on http://localhost:${PORT} (datastore: ${DATASTORE})`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
