import app from './app';
import { installShutdownHandlers, installUnhandledRejectionGuard } from './lifecycle';
import {
  flushRunReport,
  startPeriodicRunReportFlush,
} from './platform/metricsArchive';

// Before listen: a rejection during startup must not take the process with it.
installUnhandledRejectionGuard();

// Observability data is in-memory; this persists a per-run report so the p95
// decision (Req 12.9) can be made from data that survives redeploys.
startPeriodicRunReportFlush();

const PORT = Number(process.env.PORT ?? 3001);
const server = app.listen(PORT, () => {
  console.log(`Sprout backend listening on http://localhost:${PORT} (Firestore)`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Readiness:    http://localhost:${PORT}/api/health/ready`);
});

// Without this the process ignores the only stop signal any container platform
// sends, and every redeploy kills requests mid-flight. See lifecycle.ts. The
// flush writes the final observability run report while connections drain.
installShutdownHandlers(server, { flush: () => flushRunReport(true) });
