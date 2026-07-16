/**
 * backend-check.mjs — Post-edit backend validation hook.
 * Trigger: PostToolUse on Edit|Write (automatic), or manually:
 *   node scripts/agent-hooks/backend-check.mjs [--full]
 * Automatic mode runs typecheck only (a few seconds). The Jest suite
 * (~20s, SQLite + mocked Firebase — no credentials needed) runs with --full.
 * Never starts servers. Exit: 0 silent on pass; 2 + stderr on failure.
 */
import { hasScript, readStdinJson, repoRelative, runNpm, tail } from './hook-lib.mjs';

const BACKEND_FILE = /^server\/(.+\.ts|package\.json|tsconfig\.json)$/;
const TEST_FILE = /^server\/tests\//;

const full = process.argv.includes('--full');
const input = readStdinJson();
const rel = repoRelative(input.tool_input?.file_path);

if (!full && (!rel || !BACKEND_FILE.test(rel))) process.exit(0);

const failures = [];

function check(label, command, available, timeoutMs) {
  if (!available) {
    console.log(`[backend hook] skipped ${label} — script not defined in server/package.json`);
    return;
  }
  const res = runNpm(command, timeoutMs);
  if (!res.ok) failures.push(`${label} FAILED:\n${tail(res.output)}`);
}

check('typecheck', 'npm run typecheck -w server', hasScript('server', 'typecheck'), 120_000);
// Editing a test file without running it is a half-done edit — run the suite
// for test-file edits even in automatic mode; --full runs it for any edit.
if (full || (rel && TEST_FILE.test(rel))) {
  check('test', 'npm test -w server', hasScript('server', 'test'), 300_000);
}

if (failures.length > 0) {
  console.error(`[backend hook] ${rel ?? 'server'} — ${failures.join('\n\n')}`);
  process.exit(2);
}
if (full) console.log('[backend hook] typecheck + tests all passed.');
