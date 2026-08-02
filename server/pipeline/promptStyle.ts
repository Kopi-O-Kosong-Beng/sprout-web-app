/**
 * Style scaffold applied to every render prompt.
 *
 * The crafted prompt describes *this creature*; everything here describes *every
 * sprite*, so it is appended deterministically at render time rather than left
 * to the vision model to remember. A VLM paraphrases whatever you ask it to
 * carry, and paraphrased style tokens stop matching the finisher's assumptions.
 *
 * ── Why the negatives are not simply appended ──────────────────────────────
 *
 * FLUX.2 Klein — the default renderer — is guidance-distilled: no CFG, no
 * negative conditioning, and no `negative_prompt` field on the NVIDIA endpoint.
 * Black Forest Labs document this directly ("Working Without Negative Prompts").
 * A diffusion model given "no drop shadow, no plush toy" does not parse the
 * negation; it sees the tokens `drop shadow` and `plush toy` and weights them
 * *up*. Concatenating a negative list onto a Flux prompt reliably summons the
 * exact things it lists.
 *
 * So NEGATIVE_TERMS is not a suffix. It is used two ways that do work:
 *
 *   1. stripNegativeTerms() removes these words from the *crafted* prompt. This
 *      is the one that matters on Flux: when the vision model writes "soft
 *      natural lighting" or "highly detailed bark texture" into its description,
 *      that is a positive instruction, and deleting it is the only lever there
 *      is.
 *   2. negativeClauseFor() emits an explicit avoid-list, but only for the Gemini
 *      image path, which follows instruction-style negation rather than
 *      CFG-style conditioning.
 *
 * The positive list carries the real weight on both providers, which is why the
 * style targets below are stated as things to *do* — "hard aliased edges",
 * "flat colour fills" — rather than as absences.
 */

/** Appended to every prompt, both providers. */
export const POSITIVE_STYLE = [
  "192x192 pixel art sprite",
  "chunky visible pixels",
  "hard aliased edges",
  "nearest-neighbour",
  "flat colour fills",
  "no gradients",
  "thick dark outline",
  "limited palette",
  "hue-shifted shading",
  "2-3 shading steps only",
  "front-facing single creature",
  "centred",
  "transparent background",
  "16-bit game sprite",
  "SNES/GBA style",
] as const;

/**
 * Terms that contradict the sprite look, grouped by the failure they cause.
 *
 * Order matters only in that multi-word entries must be tried before the single
 * words they contain, so "depth of field" is removed whole rather than leaving a
 * stray "of field" behind. stripNegativeTerms() sorts by length to guarantee it.
 */
export const NEGATIVE_TERMS = [
  // Photographic
  "photorealistic", "photograph", "photo", "realistic", "hyperrealistic",
  "lifelike", "DSLR", "macro photography", "stock photo", "product shot",
  "studio lighting", "bokeh", "depth of field", "film grain", "natural lighting",

  // 3D / rendered
  "3D render", "CGI", "octane render", "blender", "raytraced",
  "ambient occlusion", "subsurface scattering", "specular highlight", "glossy",
  "reflective", "shiny", "soft shadow", "cast shadow", "drop shadow",

  // Craft / physical object
  "plush toy", "amigurumi", "crochet", "knitted", "yarn", "felt", "fabric",
  "sculpture", "figurine", "clay", "diorama", "papercraft", "taxidermy",

  // Rendering softness / detail density
  "smooth gradient", "anti-aliased", "soft shading", "airbrushed", "blurry",
  "high detail", "intricate detail", "fine texture", "bark texture", "fur",
  "feathers", "real leaves", "real petals", "photo collage", "composite",
  "cutout photograph",
] as const;

/**
 * Hard prompt ceilings, in characters, enforced by the provider.
 *
 * NVIDIA rejects an over-long Flux prompt outright:
 *   422 {"type":"string_too_long","loc":["body","prompt"],
 *        "msg":"String should have at most 800 characters"}
 *
 * This is a validation error, not a truncation — the render never runs, and the
 * pipeline silently falls through to the other provider. That is the worst shape
 * for a bug like this: the sprites keep arriving and look fine, so nothing
 * suggests the fast path stopped rendering at all.
 *
 * Gemini has no comparable hard cap at these lengths, hence null.
 */
export const PROVIDER_PROMPT_LIMIT: Record<"flux" | "gemini", number | null> = {
  flux: 800,
  gemini: null,
};

/** Style tokens joined for prompt use. */
const positiveClause = (): string => POSITIVE_STYLE.join(", ");

/**
 * Trims a description to fit `max` characters, preferring a sentence break and
 * falling back to a word break, so the prompt never ends mid-word.
 *
 * The style clause is never what gets cut. It is the part that makes the output
 * a sprite rather than an illustration, and it is fixed-length — so the variable
 * half, the creature description, is the half that yields.
 */
function fitWithin(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };

  const clipped = text.slice(0, max);

  const lastSentence = Math.max(clipped.lastIndexOf(". "), clipped.lastIndexOf("; "));
  if (lastSentence > max * 0.5) {
    return { text: clipped.slice(0, lastSentence), truncated: true };
  }

  const lastWord = clipped.lastIndexOf(" ");
  return {
    text: (lastWord > 0 ? clipped.slice(0, lastWord) : clipped).replace(/[\s,;.]+$/, ""),
    truncated: true,
  };
}

/**
 * Avoid-clause for instruction-following image models.
 *
 * Gemini's image models act on this; Flux does not, which is why the caller
 * passes the provider rather than this being unconditional.
 */
export function negativeClauseFor(provider: "flux" | "gemini"): string {
  if (provider === "flux") return "";
  return `Avoid entirely: ${NEGATIVE_TERMS.join(", ")}.`;
}

/**
 * Removes style-contradicting terms from a crafted prompt.
 *
 * The vision model is asked for pixel art but frequently reaches for
 * photographic or 3D vocabulary anyway ("soft natural lighting", "highly
 * detailed"), and on Flux every one of those words is an instruction. Cutting
 * them is more effective than any amount of appended negation.
 *
 * Deliberately conservative: it deletes the listed term and tidies the
 * punctuation around it, but does not attempt to rewrite the surrounding
 * sentence. A slightly clipped clause renders far better than a fluent one
 * asking for bokeh.
 */
export function stripNegativeTerms(prompt: string): {
  cleaned: string;
  removed: string[];
} {
  if (!prompt) return { cleaned: "", removed: [] };

  // Longest first, so "macro photography" is consumed before "photo".
  const byLength = [...NEGATIVE_TERMS].sort((a, b) => b.length - a.length);

  const removed: string[] = [];
  let cleaned = prompt;

  for (const term of byLength) {
    // Escape regex metacharacters; \b is unreliable against terms ending in a
    // digit or containing "/", so the boundaries are spelled out.
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[\\s,;(])${escaped}(?=$|[\\s,;.)])`, "gi");

    if (pattern.test(cleaned)) {
      removed.push(term);
      cleaned = cleaned.replace(pattern, "$1");
    }
  }

  cleaned = cleaned
    .replace(/\s{2,}/g, " ")           // collapse gaps left behind
    .replace(/\s+([,;.])/g, "$1")      // no space before punctuation
    .replace(/([,;])(\s*[,;])+/g, "$1") // collapse comma runs
    .replace(/,\s*\./g, ".")           // ", ." -> "."
    .replace(/\(\s*\)/g, "")           // empty parens
    .replace(/\s{2,}/g, " ")
    .trim();

  return { cleaned, removed };
}

/**
 * Builds the final render prompt: scrubbed description + style targets, plus an
 * avoid-clause only where the model will act on one, trimmed to the provider's
 * hard character limit.
 */
export function applyStyleScaffold(
  craftedPrompt: string,
  provider: "flux" | "gemini",
): { prompt: string; removed: string[]; truncated: boolean } {
  const { cleaned, removed } = stripNegativeTerms(craftedPrompt);

  const style = positiveClause();
  const negative = negativeClauseFor(provider);
  const limit = PROVIDER_PROMPT_LIMIT[provider];

  let description = cleaned.replace(/\s*$/, "");
  let truncated = false;

  if (limit !== null) {
    // Everything the description has to share the budget with: the style clause,
    // the avoid-clause where present, and the ". " separators and final period
    // that join() and the return line add.
    const fixed = [style, negative].filter(Boolean);
    const separators = (fixed.length + 1) * 2;
    const budget = limit - fixed.join(". ").length - separators;

    const fitted = fitWithin(description, Math.max(0, budget));
    description = fitted.text;
    truncated = fitted.truncated;
  }

  const joined = [description, style, negative]
    .filter(Boolean)
    .map((p) => p.replace(/\.?\s*$/, ""))
    .join(". ");

  return { prompt: `${joined}.`, removed, truncated };
}
