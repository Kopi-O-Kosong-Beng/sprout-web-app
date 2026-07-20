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

// 9.1 CORS — dev frontend origin only (Req 11.4).
// Extra origins here are for manual browser testing (e.g. test.html served via
// Live Server on :5500) — the real client always runs on 5173, and production
// CORS_ORIGIN should be a single trusted origin, not this list.
const devOrigins = [
  process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];
app.use(
  cors({
    origin:
      process.env.NODE_ENV === 'production' ? process.env.CORS_ORIGIN : devOrigins,
  })
);

// 9.2 body parsing
app.use(express.json());
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

// 404 for unknown API paths
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// 9.4 central error handler — must be last
app.use(errorMiddleware);

export default app;
