/**
 * secret-scan.mjs — Secret-safety hook.
 * Trigger: PreToolUse on Bash (automatic) — acts only when the command is a
 * `git commit` or `git push`; all other Bash commands pass through silently.
 * Manual full report: node scripts/agent-hooks/secret-scan.mjs --scan
 * Blocks (exit 2) when a sensitive FILE NAME or a private-key/API-key PATTERN
 * is staged. Reports names/patterns only — never prints secret values.
 * Never deletes anything.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { readStdinJson, REPO_ROOT } from './hook-lib.mjs';

const SENSITIVE_NAME =
  /(^|\/)(\.env(\..+)?|serviceAccountKey[^/]*\.json|[^/]*firebase-adminsdk[^/]*\.json|id_rsa[^/]*|[^/]+\.pem|credentials\.json)$/i;
const ALLOWED_NAME = /(^|\/)\.env\.example$/i;
// Content patterns: private key blocks, Google API keys, long "private_key" JSON values.
const SECRET_CONTENT = [
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['service-account private_key field', /"private_key"\s*:\s*"/],
];

function git(args) {
  try {
    return execSync(`git ${args}`, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return '';
  }
}

function findStagedProblems() {
  const problems = [];
  const staged = git('diff --cached --name-only').split(/\r?\n/).filter(Boolean);
  for (const file of staged) {
    if (SENSITIVE_NAME.test(file) && !ALLOWED_NAME.test(file)) {
      problems.push(`sensitive file staged: ${file}`);
    }
  }
  const diff = git('diff --cached');
  for (const [label, pattern] of SECRET_CONTENT) {
    if (pattern.test(diff)) problems.push(`staged content matches: ${label}`);
  }
  return problems;
}

if (process.argv.includes('--scan')) {
  // Manual mode: report every sensitive file in the working tree + git status.
  const all = git('ls-files --cached --others').split(/\r?\n/).filter(Boolean);
  const found = all.filter((f) => SENSITIVE_NAME.test(f) && !ALLOWED_NAME.test(f));
  const tracked = new Set(git('ls-files').split(/\r?\n/).filter(Boolean));
  if (found.length === 0) console.log('[secret hook] no sensitive files in the working tree.');
  for (const f of found) {
    console.log(
      `[secret hook] ${f} — ${tracked.has(f) ? 'TRACKED BY GIT (remove from history!)' : 'present but untracked/ignored (ok, keep it that way)'}`
    );
  }
  const key = path.join(REPO_ROOT, '..', 'serviceAccountKey.json');
  if (existsSync(key)) {
    console.log('[secret hook] note: a serviceAccountKey.json exists one level above the repo — outside git, but keep it out of any archive/zip you share.');
  }
  const staged = findStagedProblems();
  for (const p of staged) console.log(`[secret hook] STAGED RIGHT NOW: ${p}`);
  process.exit(0);
}

// Automatic PreToolUse mode: only inspect git commit/push commands.
const command = readStdinJson().tool_input?.command ?? '';
if (!/\bgit\b[^\n;|&]*\b(commit|push)\b/.test(command)) process.exit(0);

const problems = findStagedProblems();
if (problems.length > 0) {
  console.error(
    `[secret hook] BLOCKED ${/push/.test(command) ? 'push' : 'commit'} — resolve first (values not shown):\n- ${problems.join('\n- ')}\nUnstage with: git restore --staged <file>. Never commit real secrets; use .env + .gitignore.`
  );
  process.exit(2);
}
process.exit(0);
