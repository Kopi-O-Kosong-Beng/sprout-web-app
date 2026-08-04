/**
 * Server-side secrets for the sprite pipeline.
 *
 * The primary names follow plantemon-web, so a .env from that project drops in
 * unmodified: those apps drive the same upstream services with the same
 * credentials, and a divergent name is indistinguishable at runtime from a
 * missing key — the pipeline just silently degrades instead of erroring.
 *
 * On migrating into sprout-web-app that failure mode became live, because this
 * repo already had its own names for three of the same services
 * (PLANTID_API_KEY, GEMINI_API_KEY, REMOVE_BG_API_KEY, all in .env.example).
 * Two names for one credential is exactly the silent-degradation trap described
 * above, so each getter now accepts either spelling. One key, configured once,
 * serves both halves of the app.
 */

/** Companion to resolveKeys: a getter that fails loudly on a missing name. */
export function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Add it to .env.local (see .env.example).`);
  }
  return value;
}

/**
 * Resolves secrets up front so a misconfigured deployment reports a config
 * error rather than being mistaken for an upstream network failure.
 * Returns null (and logs) when anything is missing.
 */
export function resolveKeys<T extends Record<string, () => string>>(
  getters: T,
): { [K in keyof T]: string } | null {
  const resolved = {} as { [K in keyof T]: string };
  for (const name of Object.keys(getters) as (keyof T)[]) {
    try {
      resolved[name] = getters[name]();
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      return null;
    }
  }
  return resolved;
}

/** Fallback when MIN_CONFIDENCE_THRESHOLD is unset or unparseable. */
const DEFAULT_MIN_CONFIDENCE = 0.7;

export const serverEnv = {
  /** Plant.id v3 species identification. PLANTID_API_KEY is this repo's name. */
  get plantApiKey() {
    return process.env.PLANT_API_KEY || process.env.PLANTID_API_KEY || null;
  },

  /**
   * How sure Plant.id has to be before a scan is allowed to become a creature,
   * as a probability in 0..1.
   *
   * This has been declared in .env, .env.example and render.yaml since the
   * pipeline was written, and until now nothing read it: every identification
   * proceeded to generation no matter how unsure, so a 12%-confidence guess
   * still spent a render and landed a wrong species in the player's archive.
   *
   * Out-of-range or unparseable values fall back rather than throw — a typo in
   * a deployment variable should not take the scan route down — but 0 is
   * honoured, since disabling the gate is a legitimate choice.
   */
  get minConfidenceThreshold() {
    const raw = process.env.MIN_CONFIDENCE_THRESHOLD?.trim();
    if (!raw) return DEFAULT_MIN_CONFIDENCE;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      console.warn(
        `MIN_CONFIDENCE_THRESHOLD="${raw}" is not a probability between 0 and 1; ` +
          `using ${DEFAULT_MIN_CONFIDENCE}.`
      );
      return DEFAULT_MIN_CONFIDENCE;
    }
    return parsed;
  },

  /**
   * Key for the NIM chat endpoint that runs the fallback vision model.
   *
   * This and the Flux key are both NVIDIA credentials — what differs is the
   * model — so they are named for the model they authenticate. NVIDIA_API_KEY
   * stays accepted as a fallback for either.
   */
  get gemmaApiKey() {
    return process.env.GEMMA_API_KEY || process.env.NVIDIA_API_KEY || null;
  },

  /** NVIDIA credential for the Flux.2 Klein image endpoint. */
  get fluxApiKey() {
    return process.env.FLUX_API_KEY || process.env.NVIDIA_API_KEY || null;
  },

  /**
   * Google AI Studio key for the Gemini vision hop.
   *
   * Optional by design: it is the preferred path (~1.5s median against
   * gemma-4-31b-it's 69s-or-timeout), but when it is absent or its credits run
   * out the pipeline falls back to NVIDIA. A missing key costs latency, not a
   * working scan.
   */
  get geminiKey() {
    return process.env.GEMINI_KEY || process.env.GEMINI_API_KEY || null;
  },

  /**
   * withoutBG background-removal key. Optional: when absent the pipeline keeps
   * the raw render, so a missing key degrades rather than failing.
   */
  get withoutbgKey() {
    return process.env.WITHOUTBG_KEY || process.env.REMOVE_BG_API_KEY || null;
  },

  /** Overridable so a retired model can be swapped without a code change. */
  get geminiVisionModel() {
    return process.env.GEMINI_VISION_MODEL || 'gemini-3.5-flash-lite';
  },
  get nvidiaVisionModel() {
    return process.env.NVIDIA_VISION_MODEL || 'google/gemma-4-31b-it';
  },

  /**
   * Which service renders the sprite. Either provider works; the other is used
   * automatically as fallback, so this only picks who goes first.
   *
   * Measured 2026-07-26 on the same prompt with this key:
   *   flux.2-klein-4b (NVIDIA)      1.6s short / 3.3s realistic prompt
   *   gemini-3.1-flash-lite-image   4.6s  (JPEG out)
   *   gemini-2.5-flash-image        7.4s  (PNG out)
   * Flux leads on speed and matches plantemon-web, so it stays the default.
   */
  get imageProvider(): 'flux' | 'gemini' {
    return process.env.IMAGE_PROVIDER === 'gemini' ? 'gemini' : 'flux';
  },

  /**
   * Gemini image model. Defaults to gemini-3.1-flash-image: markedly stronger
   * prompt adherence than the flash-lite variant the UI used to claim, at 11.7s
   * versus 4.6s. gemini-3-pro-image is available and stronger still, but at 29s
   * it eats a quarter of the route budget on its own.
   */
  get geminiImageModel() {
    return process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
  },

  /**
   * Judge model. Must be overridable: the previous hardcoded gemini-2.0-flash is
   * still returned by ListModels but 404s on generateContent ("no longer
   * available"), which silently disabled scoring entirely.
   */
  get judgeModel() {
    return process.env.GEMINI_JUDGE_MODEL || 'gemini-3.5-flash-lite';
  },
};

/**
 * Key names surfaced in the studio's Keys & Secrets audit, in pipeline order.
 *
 * Both spellings of each aliased credential are listed, because the audit reads
 * process.env directly: showing only the primary name would report PLANT_API_KEY
 * as missing on a deployment that had correctly set PLANTID_API_KEY, which is
 * the opposite of what an audit is for.
 *
 * DATABASE_URL is gone. It was plantemon-web's Neon Postgres connection string;
 * this app's datastore is Firestore, so auditing it would permanently show one
 * missing key that nothing reads.
 */
export const AUDITED_KEYS = [
  'PLANT_API_KEY',
  'PLANTID_API_KEY',
  'GEMINI_KEY',
  'GEMINI_API_KEY',
  'GEMMA_API_KEY',
  'FLUX_API_KEY',
  'NVIDIA_API_KEY',
  'WITHOUTBG_KEY',
  'REMOVE_BG_API_KEY',
] as const;
