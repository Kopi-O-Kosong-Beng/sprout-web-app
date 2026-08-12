import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Runs the real Vitest suite and returns per-test results with the terminal
 * output each test actually produced.
 *
 * Two reporters run at once on a single execution: `json` gives the structured
 * status/duration/failure data, and `verbose` gives the human terminal stream.
 * Nothing here is synthesized — the console text on each card is the stderr the
 * test itself emitted, matched back by the test path Vitest prints above it.
 */

export interface TestCase {
  id: string;
  /** Repo-relative spec file. */
  file: string;
  /** describe() chain, outermost first. */
  suite: string[];
  /** The it() title — what the case asserts. */
  title: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  /** Real terminal output attributed to this test, already trimmed. */
  output: string;
}

export interface TestRunResult {
  ok: boolean;
  startedAt: string;
  durationMs: number;
  totals: { total: number; passed: number; failed: number; skipped: number; files: number };
  cases: TestCase[];
  /** Full unmodified terminal stream, for the raw console panel. */
  rawOutput: string;
  /** Set when the runner itself could not complete. */
  error?: string;
}

const RUN_TIMEOUT_MS = 180_000;

/**
 * The server package root — the nearest ancestor of this module that holds
 * vitest.config.ts. Resolved from the module's own location, never from
 * process.cwd(): the runner used to inherit whatever directory the server
 * happened to be launched from (a shell elsewhere, an IDE run config), and
 * from anywhere but server/ vitest quietly matched no test files and
 * reported an all-zero run as if it had completed. The walk upward also
 * absorbs the compiled layout, where this file runs from dist/platform/
 * rather than platform/.
 *
 * Exported for the test that pins the anchor to the config file.
 */
export function resolveServerRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    if (existsSync(path.join(dir, "vitest.config.ts"))) return dir;
    dir = path.dirname(dir);
  }
  // No config found above this file — fall back to the old behavior rather
  // than refuse to run; the empty-run guard in execute() will name the
  // directory if this too finds nothing.
  return process.cwd();
}

/** Guards against a second run being kicked off while one is in flight. */
let inFlight: Promise<TestRunResult> | null = null;

export function isTestRunInFlight(): boolean {
  return inFlight !== null;
}

export function runTests(projectRoot: string = resolveServerRoot()): Promise<TestRunResult> {
  if (inFlight) return inFlight;
  inFlight = execute(projectRoot).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function execute(projectRoot: string): Promise<TestRunResult> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const outputFile = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), "sprout-vitest-")),
    "results.json",
  );

  const raw = await spawnVitest(projectRoot, outputFile);

  let report: any;
  try {
    report = JSON.parse(await fs.readFile(outputFile, "utf8"));
  } catch (err) {
    return {
      ok: false,
      startedAt,
      durationMs: Date.now() - t0,
      totals: { total: 0, passed: 0, failed: 0, skipped: 0, files: 0 },
      cases: [],
      rawOutput: raw,
      error:
        "Vitest produced no JSON report — the run likely failed to start. See the raw output below.",
    };
  } finally {
    await fs.rm(path.dirname(outputFile), { recursive: true, force: true }).catch(() => {});
  }

  // A report with zero suites is a valid JSON file — vitest writes one when it
  // matches no test files at all — but it is not a completed run. Without this
  // guard it flowed through as one, and the page showed four zero tiles with
  // no explanation (the raw "No test files found" text sat collapsed behind
  // the console toggle).
  if ((report.testResults ?? []).length === 0) {
    return {
      ok: false,
      startedAt,
      durationMs: Date.now() - t0,
      totals: { total: 0, passed: 0, failed: 0, skipped: 0, files: 0 },
      cases: [],
      rawOutput: raw,
      error:
        `Vitest found no test files under ${projectRoot} — the server is ` +
        `probably running from the wrong directory. See the raw output below.`,
    };
  }

  const consoleByTest = attributeConsoleOutput(raw);
  const resultLines = collectResultLines(raw);
  const cases: TestCase[] = [];

  for (const suite of report.testResults ?? []) {
    const file = path.relative(projectRoot, suite.name);

    for (const assertion of suite.assertionResults ?? []) {
      const suitePath: string[] = assertion.ancestorTitles ?? [];
      // Vitest prints "<file> > <...describes> > <title>" above console output.
      const key = [file, ...suitePath, assertion.title].join(" > ");

      const parts: string[] = [];
      // Lead with the reporter's own line for this test, so a card that emitted
      // no console output still shows real terminal text rather than nothing.
      const line = resultLines.find((l) => l.includes(key));
      if (line) parts.push(line);
      const captured = consoleByTest.get(key);
      if (captured) parts.push(captured);
      if (assertion.failureMessages?.length) parts.push(assertion.failureMessages.join("\n\n"));

      cases.push({
        id: key,
        file,
        suite: suitePath,
        title: assertion.title,
        status:
          assertion.status === "passed" || assertion.status === "failed"
            ? assertion.status
            : "skipped",
        durationMs: Math.round((assertion.duration ?? 0) * 100) / 100,
        output: parts.join("\n\n").trim(),
      });
    }
  }

  // Failures first — on a red run that is the only thing worth looking at.
  cases.sort((a, b) => {
    const rank = (s: TestCase["status"]) => (s === "failed" ? 0 : s === "skipped" ? 1 : 2);
    return rank(a.status) - rank(b.status) || a.file.localeCompare(b.file) || a.title.localeCompare(b.title);
  });

  return {
    ok: report.success === true && cases.every((c) => c.status !== "failed"),
    startedAt,
    durationMs: Date.now() - t0,
    totals: {
      total: report.numTotalTests ?? cases.length,
      passed: report.numPassedTests ?? 0,
      failed: report.numFailedTests ?? 0,
      skipped: (report.numPendingTests ?? 0) + (report.numTodoTests ?? 0),
      // numTotalTestSuites counts describe() blocks, not spec files — reporting
      // it as "files" overstated the suite (13 vs the 6 files on disk).
      files: report.testResults?.length ?? 0,
    },
    cases,
    rawOutput: raw,
  };
}

/** Runs vitest once, capturing the combined stream. Never rejects on a red run. */
function spawnVitest(projectRoot: string, outputFile: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(
      "npx",
      [
        "vitest",
        "run",
        "--reporter=verbose",
        "--reporter=json",
        `--outputFile.json=${outputFile}`,
      ],
      {
        cwd: projectRoot,
        // CI=true stops vitest emitting the animated spinner frames, which
        // would otherwise pepper the captured stream with escape codes.
        env: { ...process.env, CI: "true", FORCE_COLOR: "0", NO_COLOR: "1" },
      },
    );

    let out = "";
    const append = (chunk: Buffer) => {
      out += chunk.toString();
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      out += `\n\nRunner aborted: exceeded ${RUN_TIMEOUT_MS / 1000}s.`;
    }, RUN_TIMEOUT_MS);

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve(`${out}\n\nFailed to start vitest: ${err.message}`);
    });
    child.on("close", () => {
      clearTimeout(timer);
      resolve(stripAnsi(out));
    });
  });
}

/**
 * Pulls the `stderr | <test path>` / `stdout | <test path>` blocks out of the
 * verbose stream and keys them by test path, so each card can show the console
 * output that its own test produced rather than the whole run's noise.
 */
function attributeConsoleOutput(raw: string): Map<string, string> {
  const byTest = new Map<string, string[]>();
  const lines = raw.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const header = lines[i].match(/^std(?:err|out)\s*\|\s*(.+?)\s*$/);
    if (!header) continue;

    const key = header[1];
    const body: string[] = [];
    // The block runs until the blank line that closes it.
    for (let j = i + 1; j < lines.length && lines[j].trim() !== ""; j++) {
      body.push(lines[j]);
      i = j;
    }
    if (body.length === 0) continue;

    const existing = byTest.get(key) ?? [];
    existing.push(body.join("\n"));
    byTest.set(key, existing);
  }

  return new Map([...byTest].map(([k, v]) => [k, v.join("\n")]));
}

/**
 * The verbose reporter's per-test result lines — " ✓ file > suite > title 3ms".
 * Kept verbatim so each card shows the reporter's own words.
 */
function collectResultLines(raw: string): string[] {
  return raw
    .split("\n")
    .filter((l) => /^\s*[✓×✗↓·]\s+\S/.test(l))
    .map((l) => l.trimEnd());
}

/** Vitest still emits some colour codes even with NO_COLOR; strip for the browser. */
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\[[0-9;]*[A-Za-z]/g, "");
}
