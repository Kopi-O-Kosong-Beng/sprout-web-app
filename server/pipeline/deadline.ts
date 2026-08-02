/**
 * Wall-clock budgeting for the sprite route, ported from plantemon-web.
 *
 * The route is sized for the NVIDIA fallback, not the happy path. On the normal
 * path it finishes in ~10s (Gemini ~1.5s, Flux ~3.3s, withoutBG ~4.3s), but
 * gemma-4-31b-it is wildly variable — 5.4s to 49s in one hour's measurements,
 * 69s-or-timeout in the next — and a cap sitting inside that tail takes the
 * whole request down rather than just the slow hop.
 */

/** Total wall-clock before we give up, kept under the 120s function limit so we
 *  always answer with our own error instead of being killed mid-flight. */
export const TOTAL_BUDGET_MS = 110_000;

/**
 * Per-hop ceilings, each also clamped to whatever budget is left.
 *
 * Gemini's is deliberately tight: it answered 20/20 calls between 1.2s and 2.2s
 * when measured, so anything past 20s means it is broken rather than slow, and
 * the sooner we give up the more budget the NVIDIA fallback inherits.
 */
/**
 * Plant.id. Previously unbounded, so a hanging identification quietly consumed
 * the whole budget and the failure surfaced later as "Flux render failed",
 * pointing at the wrong provider entirely.
 */
export const IDENTIFY_TIMEOUT_MS = 20_000;

export const GEMINI_TIMEOUT_MS = 20_000;
export const VISION_TIMEOUT_MS = 75_000;
/**
 * Render ceiling. Measured on one prompt, 2026-07-26:
 *   flux.2-klein-4b              1.6-3.3s
 *   gemini-3.1-flash-lite-image  4.6s
 *   gemini-3.1-flash-image      11.7s
 *   gemini-3-pro-image          29.0s
 * The old 30s sat right on top of pro, so a run that picked it aborted about as
 * often as it finished. 45s clears the slowest option with headroom and still
 * leaves the mandatory hops inside the 110s route budget.
 */
export const FLUX_TIMEOUT_MS = 45_000;
export const WITHOUTBG_TIMEOUT_MS = 15_000;

/**
 * LLM-as-judge ceiling.
 *
 * The judge was unbounded for the same reason Plant.id once was — it is the last
 * hop, so nothing downstream ever noticed it hanging. That position is what made
 * it the worst place to lack a ceiling: a hung judge burns the request *after*
 * identification, vision, render and cutout have all been paid for, and the
 * route gets killed at the function limit holding a finished sprite it never
 * returned. Scoring is polish; it must never cost the sprite.
 */
export const JUDGE_TIMEOUT_MS = 15_000;

/**
 * Below this there isn't time for a withoutBG call plus the sharp pass that
 * follows, so stop rather than start work that can only end in a timeout.
 */
export const MIN_USEFUL_CUTOUT_MS = 8_000;

export interface Deadline {
  remainingMs: () => number;
  /** Timeout signal for one hop: its own ceiling, or less if time is short. */
  signal: (capMs: number, hop: string) => AbortSignal;
}

/**
 * Tracks the remaining budget so each hop can bound itself by what's actually
 * left rather than by a fixed timeout that ignores how long earlier hops took.
 * The two mandatory hops (vision, Flux) get first claim; the optional polish
 * hops take what remains and are skipped when it runs out, which degrades to a
 * slightly rougher sprite instead of losing the whole scan.
 */
export function createDeadline(totalMs: number = TOTAL_BUDGET_MS): Deadline {
  const expiresAt = Date.now() + totalMs;
  return {
    remainingMs: () => expiresAt - Date.now(),
    signal(capMs: number, hop: string): AbortSignal {
      const left = expiresAt - Date.now();
      if (left <= 0) throw new Error(`Ran out of time before ${hop}.`);
      return AbortSignal.timeout(Math.min(capMs, left));
    },
  };
}
