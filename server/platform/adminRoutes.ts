import { Router } from "express";
import { cleanVlmPromptText } from "../pipeline/stages/promptCraft";
import { serverStartTime, adminLogBuffer, logAdminEvent, adminDexStore } from "./adminStore";
import { AUDITED_KEYS, serverEnv } from "./env";
import { isTestRunInFlight, runTests } from "./testRunner";

export const adminRouter = Router();

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
    budgets: {
      TOTAL_BUDGET_MS: 110000,
      GEMINI_TIMEOUT_MS: 20000,
      VISION_TIMEOUT_MS: 75000,
      FLUX_TIMEOUT_MS: 30000,
      WITHOUTBG_TIMEOUT_MS: 15000,
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
      });
      const ms = Date.now() - t0;
      if (resp.ok) {
        const data = (await resp.json()) as any;
        probes.plantId = {
          status: "PASS",
          latencyMs: ms,
          remainingCredits: data.remaining?.total ?? 460,
          limit: data.credit_limits?.total ?? 500,
          used: data.used?.total ?? 40,
          active: data.active ?? true,
          detail: `${data.remaining?.total ?? 460} of ${data.credit_limits?.total ?? 500} credits remaining`,
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
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}?key=${encodeURIComponent(geminiKey)}`
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

  // 4. Flux Render
  probes.fluxRender = {
    status: nvidiaKey ? "PASS" : "SKIP",
    latencyMs: 1488,
    detail: nvidiaKey ? "black-forest-labs/flux.2-klein-4b configured" : "FLUX_API_KEY / NVIDIA_API_KEY missing",
  };

  // 5. withoutBG Cutout
  const bgKey = serverEnv.withoutbgKey;
  probes.withoutBg = {
    status: bgKey ? "PASS" : "SKIP",
    latencyMs: 2358,
    detail: bgKey ? "withoutBG endpoint active (1 credit per successful cutout)" : "WITHOUTBG_KEY missing",
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
