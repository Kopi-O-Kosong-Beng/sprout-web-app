/**
 * dev-server.mjs — Dev-server helper hook.
 * Trigger: MANUAL, after finishing a frontend task:
 *   node scripts/agent-hooks/dev-server.mjs
 * Checks whether ports 5173 (Vite) and 3001 (Express) are in use and prints
 * exactly what to run. It deliberately does NOT spawn servers itself — hooks
 * must not leave processes running. Port 5173 is mandatory for the client:
 * backend CORS rejects anything else.
 */
import net from 'node:net';

function checkPort(port) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host: '127.0.0.1', port, timeout: 700 });
    sock.on('connect', () => { sock.destroy(); resolve(true); });
    sock.on('error', () => resolve(false));
    sock.on('timeout', () => { sock.destroy(); resolve(false); });
  });
}

const [viteUp, apiUp] = await Promise.all([checkPort(5173), checkPort(3001)]);

if (apiUp) console.log('[dev hook] backend already listening on http://localhost:3001');
else console.log('[dev hook] backend NOT running — start it: npm run dev:server');

if (viteUp) {
  console.log(
    '[dev hook] port 5173 is in use. If that IS the Sprout dev server, open http://localhost:5173.\n' +
    'If something ELSE holds 5173, free it first — do NOT let Vite fall back to 5174 (CORS will reject every API call). Never start a duplicate dev server.'
  );
} else {
  console.log('[dev hook] client NOT running — start it: npm run dev:client  →  http://localhost:5173');
}
