/** Express app wiring — tasks.md Task 9. Exported separately from server.ts so
 *  Supertest can drive it without opening a port. */
import './env'; // MUST be the first import — loads .env before other modules read it
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import errorMiddleware from './middleware/error.middleware';
import authRoutes from './routes/auth.routes';
import queryRoutes from './routes/query.routes';
import avatarRoutes from './routes/avatar.routes';
import almanacRoutes from './routes/almanac.routes';
import leaderboardRoutes from './routes/leaderboard.routes';
import battleRoutes from './routes/battle.routes';
import adminRoutes from './routes/admin.routes';
import pipelineRoutes from './routes/pipeline.routes';
import platformRoutes from './routes/platform.routes';

const app = express();

export function resolveTrustProxy(
  nodeEnv = process.env.NODE_ENV,
  configuredHops = process.env.TRUST_PROXY_HOPS
): false | number {
  if (nodeEnv !== 'production') return false;
  if (configuredHops === undefined) return 1;
  const hops = Number(configuredHops);
  return Number.isInteger(hops) && hops >= 1 && hops <= 5 ? hops : 1;
}

app.set('trust proxy', resolveTrustProxy());

// 9.1 CORS — local frontend origins only (Req 11.4).
// Vite normally uses :5173, but the local email configuration may intentionally
// use :5180. Production remains restricted to its single configured origin.
const devOrigins = [
  'http://localhost:5173',
  'http://localhost:5180',
  process.env.CORS_ORIGIN,
  'http://localhost:5500',
  'http://127.0.0.1:5500',
].filter((origin): origin is string => Boolean(origin));
app.use(
  cors({
    origin:
      process.env.NODE_ENV === 'production' ? process.env.CORS_ORIGIN : devOrigins,
  })
);

// 9.2 body parsing
//
// The sprite-pipeline router mounts its own 20 MB JSON parser for the base64
// photo a scan carries. Parsing app-wide would consume that body here first,
// under express.json()'s default 100 kb ceiling, and answer 413 before the
// router ever ran — the router's limit would be dead code. The client sends a
// 1024px JPEG at q0.85, which is 120-230 kB of base64 for an ordinary plant
// photo, so that ceiling rejects real scans while small fixtures still pass.
//
// Only that prefix is skipped. Every other route keeps the tighter default,
// which is what it wants: the rest of the API takes small forms, and raising
// the limit globally would widen the surface for oversized-body pressure.
const parseJsonBody = express.json();
app.use((req, res, next) =>
  req.path.startsWith('/api/pipeline') ? next() : parseJsonBody(req, res, next)
);
app.use(express.urlencoded({ extended: true }));

// 9.3 base rate limit (1000 req / 15 min globally)
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// 9.5 health check — the Checkoff 2 "ping"
app.get('/api/health', (_req, res) =>
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
);

// Feature routers (auth/upload/battle mount here as they land)
app.use('/api/auth', authRoutes);
app.use('/api/query', queryRoutes);
app.use('/api/avatar', avatarRoutes);
// Deliberately public at the collection level — see routes/almanac.routes.ts.
app.use('/api/almanac', almanacRoutes);
// Authenticated in full: every row names a player — see routes/leaderboard.routes.ts.
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/battle/pve', battleRoutes);
app.use('/api/admin', adminRoutes);
// Migrated from Sprout_Dev_Platform. The sprite pipeline any verified account
// may run, and the operations portal that watches it — which kept the platform's
// route names but moved off /api/admin, already used by account management.
app.use('/api/pipeline', pipelineRoutes);
app.use('/api/platform', platformRoutes);

// 404 for unknown API paths
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// 9.4 central error handler — must be last
app.use(errorMiddleware);

export default app;
