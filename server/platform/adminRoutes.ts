import { Router } from "express";
import { cleanVlmPromptText } from "../pipeline/stages/promptCraft";
import { serverStartTime, adminLogBuffer, logAdminEvent, adminDexStore } from "./adminStore";
import { AUDITED_KEYS, serverEnv } from "./env";
import { isTestRunInFlight, runTests } from "./testRunner";
import {
  clampRuns,
  isFuzzRunInFlight,
  isFuzzSuite,
  runIngestFuzz,
  FUZZ_SUITES,
  DEFAULT_FUZZ_RUNS,
  MAX_FUZZ_RUNS,
  MIN_FUZZ_RUNS,
} from "./fuzzRunner";
import {
  FLUX_TIMEOUT_MS,
  GEMINI_TIMEOUT_MS,
  IDENTIFY_TIMEOUT_MS,
  JUDGE_TIMEOUT_MS,
  MIN_USEFUL_CUTOUT_MS,
  TOTAL_BUDGET_MS,
  VISION_TIMEOUT_MS,
  WITHOUTBG_TIMEOUT_MS,
} from "../pipeline/deadline";

export const adminRouter = Router();

/**
 * Ceiling for a single reachability probe.
 *
 * These ran unbounded and in series, so one hanging provider hung the whole
 * health endpoint — the page you open precisely when a provider is misbehaving.
 */
const PROBE_TIMEOUT_MS = 10_000;

// Admin Config Status
adminRouter.get("/config-status", (req, res) => {
  const maskKey = (key?: string) => {
    if (!key) return null;
    if (key.length <= 8) return "••••••••";
    return `${key.slice(0, 4)}••••${key.slice(-4)}`;
  };

  res.json({
    uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000),
    environment: process.env.NODE_ENV || "development",
    models: {
      primaryVision: serverEnv.geminiVisionModel,
      fallbackVision: serverEnv.nvidiaVisionModel,
      fluxImageGen: "black-forest-labs/flux.2-klein-4b",
    },
    // Names follow plantemon-web so one .env.local serves both projects.
    keys: Object.fromEntries(
      AUDITED_KEYS.map((name) => [
        name,
        { configured: !!process.env[name], preview: maskKey(process.env[name]) },
      ]),
    ),
    /*
     * Read from deadline.ts, never restated. These were hardcoded here and had
     * already drifted: this endpoint reported FLUX_TIMEOUT_MS as 30s long after
     * the pipeline moved to 45s — and 30s is the exact value that was abandoned
     * for aborting mid-render about as often as it finished. A budgets panel
     * that disagrees with the budget is worse than no panel.
     */
    budgets: {
      TOTAL_BUDGET_MS,
      IDENTIFY_TIMEOUT_MS,
      GEMINI_TIMEOUT_MS,
      VISION_TIMEOUT_MS,
      FLUX_TIMEOUT_MS,
      WITHOUTBG_TIMEOUT_MS,
      JUDGE_TIMEOUT_MS,
      MIN_USEFUL_CUTOUT_MS,
    }
  });
});

// Admin Live Health & Credit Probe
adminRouter.get("/health-check", async (req, res) => {
  const probes: Record<string, any> = {};

  // 1. Plant.id
  const plantKey = serverEnv.plantApiKey;
  if (plantKey) {
    const t0 = Date.now();
    try {
      const resp = await fetch("https://api.plant.id/v3/usage_info", {
        headers: { "Api-Key": plantKey },
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      const ms = Date.now() - t0;
      if (resp.ok) {
        const data = (await resp.json()) as any;
        /*
         * Report only what the API actually returned. These fields used to fall
         * back to `?? 460`, `?? 500`, `?? 40`, `?? true` — so a response missing
         * the usage block rendered as the confident line "460 of 500 credits
         * remaining", a number nobody measured. A credit readout that invents
         * its own figures is worse than one that admits it has none.
         */
        const remaining = data.remaining?.total;
        const limit = data.credit_limits?.total;
        const known = typeof remaining === "number" && typeof limit === "number";

        probes.plantId = {
          status: "PASS",
          latencyMs: ms,
          remainingCredits: remaining ?? null,
          limit: limit ?? null,
          used: data.used?.total ?? null,
          active: data.active ?? null,
          detail: known
            ? `${remaining} of ${limit} credits remaining`
            : "Reachable; usage figures not present in the response",
        };
      } else {
        probes.plantId = { status: "FAIL", latencyMs: ms, detail: `HTTP ${resp.status}` };
      }
    } catch (e: any) {
      probes.plantId = { status: "FAIL", latencyMs: Date.now() - t0, detail: e.message };
    }
  } else {
    probes.plantId = { status: "SKIP", detail: "PLANT_API_KEY not configured" };
  }

  // 2. Gemini Vision
  const geminiKey = serverEnv.geminiKey;
  if (geminiKey) {
    const t0 = Date.now();
    try {
      const geminiModel = serverEnv.geminiVisionModel;
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}?key=${encodeURIComponent(geminiKey)}`,
        { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) }
      );
      const ms = Date.now() - t0;
      if (resp.ok) {
        probes.geminiVision = {
          status: "PASS",
          latencyMs: ms,
          model: geminiModel,
          detail: `${geminiModel} reachability check OK`,
        };
      } else {
        probes.geminiVision = { status: "FAIL", latencyMs: ms, detail: `HTTP ${resp.status}` };
      }
    } catch (e: any) {
      probes.geminiVision = { status: "FAIL", latencyMs: Date.now() - t0, detail: e.message };
    }
  } else {
    probes.geminiVision = { status: "SKIP", detail: "GEMINI_KEY not configured" };
  }

  // 3. NVIDIA Vision (Gemma)
  const nvidiaKey = serverEnv.gemmaApiKey;
  if (nvidiaKey) {
    const t0 = Date.now();
    try {
      const resp = await fetch("https://integrate.api.nvidia.com/v1/models", {
        headers: { Authorization: `Bearer ${nvidiaKey}` },
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      const ms = Date.now() - t0;
      if (resp.ok) {
        probes.nvidiaVision = {
          status: ms > 25000 ? "WARN" : "PASS",
          latencyMs: ms,
          model: serverEnv.nvidiaVisionModel,
          detail: ms > 25000 ? "Reachable but high latency (>25s tail risk)" : "Gemma 4 31B reachability OK",
        };
      } else {
        probes.nvidiaVision = { status: "FAIL", latencyMs: ms, detail: `HTTP ${resp.status}` };
      }
    } catch (e: any) {
      probes.nvidiaVision = { status: "FAIL", latencyMs: Date.now() - t0, detail: e.message };
    }
  } else {
    probes.nvidiaVision = { status: "SKIP", detail: "GEMMA_API_KEY / NVIDIA_API_KEY not configured" };
  }

  /*
   * 4 & 5: config checks, not probes — and labelled as such.
   *
   * Both of these reported status PASS with a hardcoded latency (1488ms and
   * 2358ms) whenever a key was present, without contacting anything. So the
   * health page showed Flux green at 1488ms while Flux was in fact refusing
   * every render — the single most misleading thing this endpoint could do,
   * since it is the page you open to find out whether Flux is working.
   *
   * They stay unprobed deliberately: both are billed per call, and a health
   * check that spends a credit every time you load the page is its own problem.
   * SKIP renders neutral rather than green, which is the honest reading — key
   * present, liveness unknown.
   */
  probes.fluxRender = {
    status: "SKIP",
    latencyMs: null,
    detail: serverEnv.fluxApiKey
      ? "black-forest-labs/flux.2-klein-4b key present — not probed (a render is billed)"
      : "FLUX_API_KEY / NVIDIA_API_KEY missing",
  };

  const bgKey = serverEnv.withoutbgKey;
  probes.withoutBg = {
    status: "SKIP",
    latencyMs: null,
    detail: bgKey
      ? "withoutBG key present — not probed (1 credit per successful cutout)"
      : "WITHOUTBG_KEY missing",
  };

  res.json({
    timestamp: new Date().toISOString(),
    overallStatus: Object.values(probes).some((p) => p.status === "FAIL") ? "DEGRADED" : "HEALTHY",
    probes,
  });
});

// Admin Log Analyzer
adminRouter.get("/logs", (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    logs: adminLogBuffer,
  });
});

// Admin VLM Prompt Cleaning Playground Test
adminRouter.post("/clean-prompt", (req, res) => {
  const { rawText } = req.body;
  if (!rawText) {
    return res.status(400).json({ error: "rawText parameter required" });
  }

  try {
    const cleaned = cleanVlmPromptText(rawText);
    res.json({
      rawText,
      cleanedText: cleaned,
      characterDiff: rawText.length - cleaned.length,
      hasRefusalPreambles: rawText !== cleaned,
    });
  } catch (err: any) {
    res.json({
      rawText,
      cleanedText: null,
      error: err.message,
      triggeredFallback: true,
    });
  }
});



// Admin Dex Document Manager Routes
adminRouter.get("/dex-docs", (req, res) => {
  res.json(Object.values(adminDexStore));
});

adminRouter.post("/dex-approve", (req, res) => {
  const { id, status } = req.body;
  if (!id || !adminDexStore[id]) {
    return res.status(404).json({ error: "Dex entry not found" });
  }
  adminDexStore[id].status = status || "APPROVED";
  logAdminEvent("info", "Dex", `Species ${adminDexStore[id].species} status updated to ${status}`);
  res.json({ success: true, entry: adminDexStore[id] });
});

/**
 * Runs the Vitest suite and returns per-test results with real terminal output.
 *
 * POST rather than GET because it spawns a process and is not idempotent — and
 * it is deliberately serialised: two concurrent `vitest run` invocations fight
 * over the same cache directory and produce misleading results.
 */
adminRouter.post("/run-tests", async (req, res) => {
  if (isTestRunInFlight()) {
    return res.status(409).json({ error: "A test run is already in progress." });
  }

  const startedAt = Date.now();
  logAdminEvent("info", "Tests", "Vitest suite run started");

  try {
    const result = await runTests(process.cwd());
    logAdminEvent(
      result.ok ? "info" : "error",
      "Tests",
      `Vitest finished in ${Date.now() - startedAt}ms: ${result.totals.passed}/${result.totals.total} passed`,
    );
    res.json(result);
  } catch (err: any) {
    logAdminEvent("error", "Tests", `Vitest runner failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Fuzzes the image ingest gate and returns the structured report.
 *
 * FREE AND OFFLINE. The sink is validateUploadedImage — the same function
 * /api/pipeline/run-stream calls on every scan — so this touches no external
 * API and bills nothing. The paid live fuzzer is deliberately unreachable from
 * here; see platform/fuzzRunner.ts.
 *
 * POST for the same reasons as /run-tests: not idempotent, and serialised
 * because the work is CPU-bound image decoding.
 *
 * `rngSeed` is optional. Omitted, the run explores fresh mutations and reports
 * the seed it chose; supplied, it replays an earlier run exactly — which is how
 * an operator reproduces a finding someone else hit.
 */
adminRouter.post("/run-fuzz", async (req, res) => {
  if (isFuzzRunInFlight()) {
    return res.status(409).json({ error: "A fuzz run is already in progress." });
  }

  const suite = isFuzzSuite(req.body?.suite) ? req.body.suite : "mutation";

  // Undefined lets each suite pick its own default: the baseline is far
  // cheaper per run than a mutation, so they do not share a sensible number.
  const rawRuns = req.body?.runs;
  const runs = rawRuns === undefined ? undefined : clampRuns(Number(rawRuns));

  // Distinguish "explore" from "replay seed 0", which is a legitimate seed.
  const rawSeed = req.body?.rngSeed;
  const rngSeed =
    rawSeed === undefined || rawSeed === null || rawSeed === ""
      ? undefined
      : Number(rawSeed);
  if (rngSeed !== undefined && !Number.isFinite(rngSeed)) {
    return res.status(400).json({ error: "rngSeed must be a number." });
  }

  logAdminEvent("info", "Fuzz", `Fuzz run started: ${suite}`);

  try {
    const result = await runIngestFuzz({ suite, runs, rngSeed });
    const findings =
      result.mutation?.findings.length ??
      result.text?.findings.length ??
      (result.baseline ? result.baseline.survivors : 0);
    logAdminEvent(
      result.ok ? "info" : "error",
      "Fuzz",
      `Fuzz (${suite}) finished in ${result.durationMs}ms: ${findings} finding(s)`,
    );
    res.json(result);
  } catch (err: any) {
    logAdminEvent("error", "Fuzz", `Fuzz runner failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/** Bounds the page renders next to its runs field, so the UI never has to
 *  restate numbers the server owns. */
adminRouter.get("/fuzz-config", (_req, res) => {
  res.json({
    minRuns: MIN_FUZZ_RUNS,
    maxRuns: MAX_FUZZ_RUNS,
    defaultRuns: DEFAULT_FUZZ_RUNS,
    suites: FUZZ_SUITES,
  });
});
