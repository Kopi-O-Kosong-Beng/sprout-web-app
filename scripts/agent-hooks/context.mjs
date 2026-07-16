/**
 * context.mjs — Pre-task context hook.
 * Trigger: SessionStart (automatic) or `node scripts/agent-hooks/context.mjs`.
 * Purpose: remind the agent which docs are authoritative and which package
 * scripts exist before it starts a task. Emits guidance only; never edits.
 * Exit: always 0 (non-blocking).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './hook-lib.mjs';

const docs = [
  ['README.md', 'setup + run commands'],
  ['FRONTEND_HANDOFF.md', 'frontend↔backend integration patterns'],
  ['requirements.md', 'formal requirements (do not edit casually)'],
  ['DESIGN.md', 'visual design source of truth'],
  ['tasks.md', 'task ownership + status checkboxes'],
  ['IMPLEMENTATION_PLAN.md', 'build order, testing strategy, DoD'],
  ['checkoff.md', 'flow-by-flow walkthrough with file:line refs'],
];

const lines = ['[sprout context hook] Before starting, know your ground:'];
lines.push('Docs (read the ones relevant to this task):');
for (const [file, why] of docs) {
  const mark = existsSync(path.join(REPO_ROOT, file)) ? ' ' : ' (MISSING)';
  lines.push(`  - ${file}${mark} — ${why}`);
}

for (const ws of ['client', 'server', 'root']) {
  const pkgPath =
    ws === 'root'
      ? path.join(REPO_ROOT, 'package.json')
      : path.join(REPO_ROOT, ws, 'package.json');
  if (!existsSync(pkgPath)) continue;
  try {
    const scripts = Object.keys(JSON.parse(readFileSync(pkgPath, 'utf8')).scripts ?? {});
    lines.push(`${ws} scripts: ${scripts.join(', ')}`);
  } catch {
    /* unreadable package.json — skip, context is best-effort */
  }
}

lines.push(
  'Classify the task first (frontend / backend / design / testing / docs) and scope to it — do not refactor beyond the ask.'
);

console.log(lines.join('\n'));
