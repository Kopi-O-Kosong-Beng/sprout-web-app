/**
 * frontend-check.mjs — Post-edit frontend validation hook.
 * Trigger: PostToolUse on Edit|Write (automatic), or manually:
 *   node scripts/agent-hooks/frontend-check.mjs [--full]
 * Automatic mode = fast checks only: incremental `tsc -b` (hard gate) plus
 * oxlint warnings filtered to the edited file (oxlint exits 0 even on
 * findings, so raw exit codes can't gate; pre-existing warnings elsewhere
 * must not fail an unrelated edit). Build + tests run only with --full.
 * Exit: 0 silent on pass or non-frontend file; 2 + stderr on failure.
 */
import { hasScript, readStdinJson, repoRelative, runNpm, tail } from './hook-lib.mjs';

const FRONTEND_FILE =
  /^client\/(src\/.+\.(tsx?|css)|index\.html|vite\.config\.ts)$/;

const full = process.argv.includes('--full');
const input = readStdinJson();
const rel = repoRelative(input.tool_input?.file_path);

if (!full && (!rel || !FRONTEND_FILE.test(rel))) process.exit(0);

const failures = [];

// 1. Typecheck — the hard gate. Incremental, so post-edit runs stay fast.
const tsc = runNpm('npx tsc -b client', 120_000);
if (!tsc.ok) failures.push(`typecheck FAILED:\n${tail(tsc.output)}`);

// 2. Lint — oxlint always exits 0, so grep its report for the edited file.
if (hasScript('client', 'lint')) {
  const lint = runNpm('npm run lint -w client', 60_000);
  const fileNeedle = rel?.replace(/^client\//, '');
  const relevant = fileNeedle
    ? lint.output.split(/\r?\n/).filter((l) => l.includes(fileNeedle))
    : [];
  if (relevant.length > 0) failures.push(`lint findings in ${rel}:\n${relevant.join('\n')}`);
  if (full && !lint.ok) failures.push(`lint FAILED:\n${tail(lint.output)}`);
} else {
  console.log('[frontend hook] skipped lint — no lint script in client/package.json');
}

if (full) {
  for (const [label, script, timeout] of [
    ['build', 'build', 300_000],
    ['test', 'test', 300_000],
  ]) {
    if (!hasScript('client', script)) {
      console.log(`[frontend hook] skipped ${label} — script not defined in client/package.json`);
      continue;
    }
    const res = runNpm(`npm run ${script} -w client`, timeout);
    if (!res.ok) failures.push(`${label} FAILED:\n${tail(res.output)}`);
  }
}

if (failures.length > 0) {
  console.error(`[frontend hook] ${rel ?? 'client'} — ${failures.join('\n\n')}`);
  process.exit(2);
}
if (full) console.log('[frontend hook] typecheck/lint/build/test all passed.');
