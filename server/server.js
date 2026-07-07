/** Entry point — tasks.md 9.6: run migrations, then listen. */
const app = require('./app');
const db = require('./database/db');

const PORT = process.env.PORT || 3001;

(async () => {
  await db.migrate.latest();
  app.listen(PORT, () => {
    console.log(`Sprout backend listening on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });
})().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
