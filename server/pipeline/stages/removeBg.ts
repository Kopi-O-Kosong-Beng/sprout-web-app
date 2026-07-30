import {
  Deadline,
  MIN_USEFUL_CUTOUT_MS,
  WITHOUTBG_TIMEOUT_MS,
} from "../deadline";

const WITHOUTBG_ENDPOINT =
  "https://api.withoutbg.com/v1.0/image-without-background-base64";

/** HTTP statuses that won't change on retry — a bad key or no credit. */
const PERMANENT = new Set([401, 402, 403, 413, 415, 422]);

const MAX_ATTEMPTS = 3;

export interface RemoveBgResult {
  png: Buffer;
  /** True only for a real matting cutout — never for a passed-through render. */
  removeBgOk: boolean;
}

/**
 * Runs the render through withoutBG to get a true RGBA cutout.
 *
 * This step matters because Flux paints a checkerboard-looking "transparent"
 * backdrop into opaque pixels, which would otherwise show as a box around the
 * creature when it composites into the Dex.
 *
 * Deliberately non-fatal: once retries are exhausted — or the key is missing,
 * or credits are gone — it returns the raw render rather than failing the whole
 * scan, and reports removeBgOk false so callers know the background is still
 * baked in. Billed one credit per successful call.
 *
 * The previous local corner-colour keying fallback is gone: it produced an
 * alpha channel that looked like a cutout but was keyed off a sampled corner,
 * so a sprite touching the frame edge lost chunks of itself. Passing the raw
 * render through is the honest degradation, and is what the golden set's
 * edge_removebg_degraded case asserts (hasAlpha: false).
 */
export async function removeBackgroundSafe(
  inputPng: Buffer,
  withoutBgApiKey?: string | null,
  deadline?: Deadline,
): Promise<RemoveBgResult> {
  if (!withoutBgApiKey || withoutBgApiKey === "MOCK_KEY") {
    return { png: inputPng, removeBgOk: false };
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Below this there isn't time for a call plus the sharp pass that follows,
    // so stop rather than start work that can only end in a timeout.
    if (deadline && deadline.remainingMs() < MIN_USEFUL_CUTOUT_MS) {
      console.warn("Not enough budget left for withoutBG, keeping raw sprite.");
      return { png: inputPng, removeBgOk: false };
    }

    try {
      const response = await fetch(WITHOUTBG_ENDPOINT, {
        method: "POST",
        headers: { "X-API-Key": withoutBgApiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: inputPng.toString("base64") }),
        // Normally ~3-4s; a short cap keeps 3 attempts from stacking into a
        // route timeout when the API is hanging.
        signal: deadline?.signal(WITHOUTBG_TIMEOUT_MS, "background removal"),
      });

      if (response.ok) {
        const cutout = ((await response.json()) as any)?.img_without_background_base64;
        if (typeof cutout === "string" && cutout.length > 0) {
          return { png: Buffer.from(cutout, "base64"), removeBgOk: true };
        }
        console.warn("withoutBG returned no cutout, keeping raw sprite.");
        return { png: inputPng, removeBgOk: false };
      }

      const detail = (await response.text()).slice(0, 200);
      if (PERMANENT.has(response.status)) {
        console.error(`withoutBG ${response.status} (not retryable): ${detail}`);
        return { png: inputPng, removeBgOk: false };
      }
      console.warn(`withoutBG ${response.status}, attempt ${attempt}/${MAX_ATTEMPTS}: ${detail}`);
    } catch (error: any) {
      console.warn(
        `withoutBG request failed, attempt ${attempt}/${MAX_ATTEMPTS}: ${error?.message ?? error}`,
      );
    }

    // Brief backoff before the next try.
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }

  console.warn("withoutBG exhausted retries, keeping raw sprite.");
  return { png: inputPng, removeBgOk: false };
}
