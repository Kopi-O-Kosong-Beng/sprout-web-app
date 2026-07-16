/**
 * hook-lib.mjs — shared helpers for all agent hooks.
 * Not a hook itself. Every hook script imports from here so behavior stays
 * consistent: stdin parsing, repo-root resolution, path matching, npm runs.
 * Deterministic, no external dependencies, Windows-compatible (plain Node).
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** sprout-web-app repo root, resolved from this file's location so hooks work
 *  no matter which directory Claude Code (or a human) runs them from. */
export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);

/** Read the hook JSON Claude Code pipes to stdin. Returns {} when run
 *  manually with no stdin so scripts stay usable from a terminal. */
export function readStdinJson() {
  try {
    const raw = readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Normalize a file path from hook input to a repo-relative, forward-slash
 *  form; returns null when the file is outside the sprout-web-app repo.
 *  Accepts Windows (c:\...), POSIX, and Git-Bash (/c/...) style paths. */
export function repoRelative(filePath) {
  if (!filePath) return null;
  let p = filePath;
  const gitBash = /^\/([a-zA-Z])\/(.*)$/.exec(p);
  if (process.platform === 'win32' && gitBash) {
    p = `${gitBash[1]}:/${gitBash[2]}`;
  }
  const rel = path.relative(REPO_ROOT, path.resolve(p)).replaceAll('\\', '/');
  return rel.startsWith('..') ? null : rel;
}

/** True when the workspace's package.json declares the given script. */
export function hasScript(workspace, name) {
  const pkgPath =
    workspace === 'root'
      ? path.join(REPO_ROOT, 'package.json')
      : path.join(REPO_ROOT, workspace, 'package.json');
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return Boolean(pkg.scripts?.[name]);
  } catch {
    return false;
  }
}

/** Run an npm script from the repo root. Returns {ok, output} and never
 *  throws — hooks decide themselves how to report failure. */
export function runNpm(command, timeoutMs = 120_000) {
  try {
    const output = execSync(command, {
      cwd: REPO_ROOT,
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    return { ok: true, output };
  } catch (err) {
    const output = [err.stdout, err.stderr].filter(Boolean).join('\n');
    return { ok: false, output: output || String(err.message) };
  }
}

/** Last N lines of command output — hooks surface concise failures only. */
export function tail(text, lines = 25) {
  return text.split(/\r?\n/).filter(Boolean).slice(-lines).join('\n');
}

/** Emit non-blocking context for Claude from a PostToolUse hook (exit 0). */
export function emitPostToolContext(text) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text },
    })
  );
}
