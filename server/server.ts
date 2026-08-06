import app from './app';
import { installShutdownHandlers } from './lifecycle';

const PORT = Number(process.env.PORT ?? 3001);
const server = app.listen(PORT, () => {
  console.log(`Sprout backend listening on http://localhost:${PORT} (Firestore)`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Readiness:    http://localhost:${PORT}/api/health/ready`);
});

// Without this the process ignores the only stop signal any container platform
// sends, and every redeploy kills requests mid-flight. See lifecycle.ts.
installShutdownHandlers(server);
