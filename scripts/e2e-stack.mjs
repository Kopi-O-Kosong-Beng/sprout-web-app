#!/usr/bin/env node
/**
 * Boots the stack an end-to-end run needs, in dependency order, and tears it
 * all down together.
 *
 *     Firestore emulator  :8080   (Java, via firebase-tools)
 *          ↓ must accept connections before anything queries it
 *     seed                        (one-off: demo species, avatars, almanac)
 *          ↓
 *     Express API         :3001   (mocked providers, dev auth bypass)
 *          ↓
 *     Vite dev server     :5173   (dev build, so the sign-in shortcut works)
 *
 * ── Why a script instead of Playwright's `webServer: [...]` ──────────────────
 * That array starts everything at once and waits on each URL independently. The
 * ordering here is a real dependency: an API that opens its port before the
 * emulator is listening fails its first Firestore call, and the failure looks
 * like an application bug. Sequencing has to be explicit. The seed step is not
 * a server at all, so it has nowhere to live in that array.
 *
 * ── Why the Vite DEV server and not a production build ───────────────────────
 * The sign-in shortcut these specs use is fenced behind `import.meta.env.DEV`,
 * which compiles to a literal `false` in `vite build`. That fence is the whole
 * point — it is what keeps the shortcut out of production — so E2E deliberately
 * drives the dev build. Stated plainly: these specs prove the journeys, not the
 * production bundle. The production bundle is covered by the container smoke
 * tests in .github/workflows/docker.yml.
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_DIR = path.join(ROOT, 'server');
const CLIENT_DIR = path.join(ROOT, 'client');

const EMULATOR_PORT = 8080;
const AUTH_EMULATOR_PORT = 9099;
const STORAGE_EMULATOR_PORT = 9199;
const API_PORT = 3001;
const WEB_PORT = 5173;

/** Shared by the seed step and the API, so they agree on which project and
 *  which emulator they are talking to.
 *
 *  The three FIREBASE_SERVICE_ACCOUNT_* blanks are load-bearing. server/.env
 *  configures the production service account, and dotenv never overrides a
 *  variable that is already set — so setting them to '' here is how the seed
 *  and the API are kept from picking that credential up. Without this, both
 *  initialized firebase-admin with the service account's real project id and
 *  sent every emulator request under it, which (a) put the production
 *  credential inside a stack that must never need one, and (b) made the
 *  emulator log "Requested project ID …, but the emulator is configured for
 *  sprout-e2e" on every request — hundreds of lines that drowned the output
 *  the stack exists to show. Credential-less init falls back to
 *  GCLOUD_PROJECT, so every process agrees on sprout-e2e. */
const FIRESTORE_ENV = {
  FIRESTORE_EMULATOR_HOST: `127.0.0.1:${EMULATOR_PORT}`,
  GCLOUD_PROJECT: 'sprout-e2e',
  GOOGLE_CLOUD_PROJECT: 'sprout-e2e',
  FIREBASE_SERVICE_ACCOUNT_JSON: '',
  FIREBASE_SERVICE_ACCOUNT_BASE64: '',
  FIREBASE_SERVICE_ACCOUNT_PATH: '',
};

const children = [];
let shuttingDown = false;

const log = (message) => console.log(`[e2e-stack] ${message}`);

function waitForPort(port, label, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ port, host: '127.0.0.1' });
      socket.once('connect', () => {
        socket.destroy();
        log(`${label} is listening on ${port}`);
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`${label} did not open port ${port} within ${timeoutMs}ms`));
          return;
        }
        setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

function isPortBusy(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function pipeOutput(label, child) {
  const emit = (stream, line) => stream(`[${label}] ${line}`);
  child.stdout?.on('data', (d) =>
    String(d).split('\n').filter(Boolean).forEach((l) => emit(console.log, l))
  );
  child.stderr?.on('data', (d) =>
    String(d).split('\n').filter(Boolean).forEach((l) => emit(console.error, l))
  );
}

function start(label, command, args, { cwd = ROOT, env = {} } = {}) {
  log(`starting ${label}`);
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  pipeOutput(label, child);
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`[e2e-stack] ${label} exited early with code ${code}`);
      shutdown(1);
    }
  });
  children.push({ label, child });
  return child;
}

/** Runs to completion, unlike start(). Used for the seed. */
function run(label, command, args, { cwd = ROOT, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    log(`running ${label}`);
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    pipeOutput(label, child);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${label} exited with code ${code}`))
    );
  });
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('shutting down');
  for (const { label, child } of [...children].reverse()) {
    log(`stopping ${label}`);
    // SIGTERM first: the API has a graceful drain (server/lifecycle.ts), and
    // this is one of the few places it runs outside a container.
    try {
      child.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
  setTimeout(() => process.exit(code), 3_000).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  if (await isPortBusy(WEB_PORT)) {
    log(`port ${WEB_PORT} already serving — reusing the running stack`);
    setInterval(() => {}, 1 << 30);
    return;
  }

  // ── 1. Firebase emulators ────────────────────────────────────────────────
  // Three, not one, and each buys a journey the suite could not otherwise make:
  //   firestore — every read and write in the product
  //   auth      — real server-side signup (auth.controller createUser goes to
  //               the emulator instead of live Firebase)
  //   storage   — the sprite write that completes a scan; without it,
  //               sprite-storage.ts throws on FIREBASE_STORAGE_BUCKET and the
  //               UC6→UC4 journey cannot be exercised end to end
  if (await isPortBusy(EMULATOR_PORT)) {
    log(`port ${EMULATOR_PORT} in use — assuming emulators are already running`);
  } else {
    start('emulator', 'npx', [
      'firebase',
      'emulators:start',
      '--only',
      'firestore,auth,storage',
      '--project',
      'sprout-e2e',
    ]);
    await waitForPort(EMULATOR_PORT, 'firestore emulator');
    await waitForPort(AUTH_EMULATOR_PORT, 'auth emulator');
    await waitForPort(STORAGE_EMULATOR_PORT, 'storage emulator');
  }

  // ── 2. Seed ──────────────────────────────────────────────────────────────
  // The emulator starts empty on every run. Without this the archive and
  // leaderboard journeys would assert against nothing and pass vacuously.
  await run('seed', 'npx', ['tsx', 'scripts/seed-firestore.ts'], {
    cwd: SERVER_DIR,
    env: { ...FIRESTORE_ENV, NODE_ENV: 'development' },
  });

  // ── 3. API ───────────────────────────────────────────────────────────────
  start('api', 'npx', ['tsx', 'server.ts'], {
    cwd: SERVER_DIR,
    env: {
      ...FIRESTORE_ENV,
      NODE_ENV: 'development',
      PORT: String(API_PORT),
      // The dev-header identity the browser presents. Independently fenced on
      // the server by NODE_ENV !== 'production'.
      AUTH_DEV_BYPASS: 'true',
      // No paid provider call ever originates from this suite.
      USE_MOCK_APIS: 'true',
      EMAIL_MODE: 'console',
      CORS_ORIGIN: `http://127.0.0.1:${WEB_PORT}`,
      FRONTEND_URL: `http://127.0.0.1:${WEB_PORT}`,
      SUPER_ADMIN_EMAILS: 'test@sprout.com',
      ADMIN_EMAILS: 'test@sprout.com',

      // Server-side Firebase Auth (signup's createUser, verification links)
      // goes to the emulator. firebase-admin reads this variable natively.
      FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${AUTH_EMULATOR_PORT}`,

      // Sprite writes go to the Storage emulator, which makes the UC6→UC4
      // scan-to-archive journey real end to end. Both spellings on purpose:
      // @google-cloud/storage reads STORAGE_EMULATOR_HOST (scheme required),
      // firebase-admin's own wrapper reads FIREBASE_STORAGE_EMULATOR_HOST.
      FIREBASE_STORAGE_BUCKET: 'sprout-e2e.appspot.com',
      STORAGE_EMULATOR_HOST: `http://127.0.0.1:${STORAGE_EMULATOR_PORT}`,
      FIREBASE_STORAGE_EMULATOR_HOST: `127.0.0.1:${STORAGE_EMULATOR_PORT}`,
    },
  });
  await waitForPort(API_PORT, 'api');

  // ── 4. Web ───────────────────────────────────────────────────────────────
  start('web', 'npx', ['vite', '--port', String(WEB_PORT), '--host', '127.0.0.1'], {
    cwd: CLIENT_DIR,
    env: {
      VITE_API_URL: `http://127.0.0.1:${API_PORT}`,
      VITE_ENABLE_DEMO_TOOLS: 'true',
    },
  });
  await waitForPort(WEB_PORT, 'web');

  log('stack is up');
}

main().catch((error) => {
  console.error(`[e2e-stack] ${error.message}`);
  shutdown(1);
});
