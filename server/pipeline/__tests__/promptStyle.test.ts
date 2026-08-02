import { describe, it, expect } from "vitest";
import {
  applyStyleScaffold,
  negativeClauseFor,
  stripNegativeTerms,
  POSITIVE_STYLE,
  PROVIDER_PROMPT_LIMIT,
} from "../promptStyle";

/**
 * The load-bearing asymmetry: FLUX.2 Klein is guidance-distilled and has no
 * negative conditioning, so a negative list reaches it as a *request*. Gemini's
 * image models follow instruction-style negation, so they get the avoid-clause
 * and Flux never does.
 */
describe("negative handling is provider-specific", () => {
  it("[black-box: decision-table] emits no avoid-clause for flux", () => {
    expect(negativeClauseFor("flux")).toBe("");
  });

  it("[black-box: decision-table] emits an avoid-clause for gemini", () => {
    const clause = negativeClauseFor("gemini");
    expect(clause).toMatch(/^Avoid entirely:/);
    expect(clause).toContain("plush toy");
    expect(clause).toContain("bokeh");
  });

  it("[black-box: spec] never leaks a negative term into a flux prompt", () => {
    const { prompt } = applyStyleScaffold("A round mossy creature.", "flux");
    for (const banned of ["plush toy", "bokeh", "photorealistic", "drop shadow"]) {
      expect(prompt.toLowerCase()).not.toContain(banned);
    }
  });
});

describe("stripNegativeTerms", () => {
  it("[black-box: equivalence] removes photographic vocabulary the vision model reached for", () => {
    const { cleaned, removed } = stripNegativeTerms(
      "A chubby fern creature, photorealistic, with soft natural lighting and bokeh.",
    );

    expect(cleaned.toLowerCase()).not.toContain("photorealistic");
    expect(cleaned.toLowerCase()).not.toContain("bokeh");
    expect(cleaned.toLowerCase()).not.toContain("natural lighting");
    expect(removed).toEqual(expect.arrayContaining(["photorealistic", "bokeh"]));
    // The subject survives the scrub.
    expect(cleaned).toContain("chubby fern creature");
  });

  /**
   * Longest-first matching. Naive iteration removes "photo" from inside "macro
   * photography" and leaves "macro graphy" behind.
   */
  it("[white-box: branch] consumes multi-word terms whole rather than their substrings", () => {
    const { cleaned, removed } = stripNegativeTerms("Shot as macro photography.");

    expect(removed).toContain("macro photography");
    expect(cleaned).not.toMatch(/graphy/);
  });

  it("[black-box: equivalence] leaves a clean prompt untouched", () => {
    const input = "A round mossy creature with a leafy crest.";
    const { cleaned, removed } = stripNegativeTerms(input);

    expect(cleaned).toBe(input);
    expect(removed).toEqual([]);
  });

  it("[white-box: boundary] does not strip a term embedded inside a longer word", () => {
    // "photo" must not fire inside "photosynthesis".
    const { cleaned } = stripNegativeTerms("A creature powered by photosynthesis.");
    expect(cleaned).toContain("photosynthesis");
  });

  it("[white-box: branch] tidies the punctuation a removal leaves behind", () => {
    const { cleaned } = stripNegativeTerms("A fern, glossy, shiny, with a crest.");

    expect(cleaned).not.toMatch(/,\s*,/);
    expect(cleaned).not.toMatch(/\s,/);
    expect(cleaned).toBe("A fern, with a crest.");
  });

  it("[black-box: boundary] returns empty for empty input", () => {
    expect(stripNegativeTerms("")).toEqual({ cleaned: "", removed: [] });
  });
});

describe("applyStyleScaffold", () => {
  it("[black-box: spec] appends every positive style target on both providers", () => {
    for (const provider of ["flux", "gemini"] as const) {
      const { prompt } = applyStyleScaffold("A round mossy creature.", provider);
      for (const token of POSITIVE_STYLE) {
        expect(prompt).toContain(token);
      }
    }
  });

  it("[black-box: equivalence] reports what it stripped so the studio can show it", () => {
    const { removed } = applyStyleScaffold("A fern, hyperrealistic, with fur.", "flux");
    expect(removed).toEqual(expect.arrayContaining(["hyperrealistic", "fur"]));
  });

  it("[black-box: spec] produces a single well-formed sentence run without doubled periods", () => {
    const { prompt } = applyStyleScaffold("A round mossy creature.", "gemini");
    expect(prompt).not.toMatch(/\.\./);
    expect(prompt.endsWith(".")).toBe(true);
  });
});

/**
 * NVIDIA rejects an over-long Flux prompt with a 422 rather than truncating it,
 * so the render never runs and the pipeline falls through to the other provider.
 * The sprites keep arriving and look fine, which is exactly why this went
 * unnoticed — the only visible symptom is that the fast path stopped being used.
 */
describe("Flux's 800-character prompt limit", () => {
  const LONG = `A retro 16-bit pixel-art creature inspired by Fritillaria imperialis, featuring a chubby round orange bell-shaped body crowned with a vibrant green topknot of upright lance-shaped leaves, with a ring of downward-hanging burnt-orange bell flowers circling its waist like a skirt of lanterns, large expressive eyes set wide above a small friendly mouth, tiny root-like feet peeking out beneath, and a sturdy upright stem forming its spine, drawn with clean bold black outlines and flat cel-shaded colouring on a solid flat pure-white background with a clear margin on every side.`;

  it("[white-box: boundary] a long description is trimmed to fit exactly within 800 chars", () => {
    const { prompt, truncated } = applyStyleScaffold(LONG, "flux");

    expect(truncated).toBe(true);
    expect(prompt.length).toBeLessThanOrEqual(PROVIDER_PROMPT_LIMIT.flux!);
  });

  it("[black-box: spec] trimming sacrifices the description, never the style clause", () => {
    const { prompt } = applyStyleScaffold(LONG, "flux");

    // The style targets are what make the output a sprite — they must survive.
    for (const token of POSITIVE_STYLE) {
      expect(prompt).toContain(token);
    }
    // And the subject is still recognisable.
    expect(prompt).toContain("Fritillaria imperialis");
  });

  it("[white-box: boundary] a description that already fits is left untouched", () => {
    const short = "A round mossy creature with a leafy crest.";
    const { prompt, truncated } = applyStyleScaffold(short, "flux");

    expect(truncated).toBe(false);
    expect(prompt).toContain(short.replace(/\.$/, ""));
  });

  it("[black-box: spec] never ends mid-word after trimming", () => {
    const { prompt } = applyStyleScaffold(LONG, "flux");
    // The description runs up to the style clause; check the join is clean.
    expect(prompt).not.toMatch(/\s\.\s/);
    expect(prompt).not.toMatch(/,\s*\./);
  });

  /** Gemini has no comparable cap, so nothing should be cut on that path. */
  it("[black-box: decision-table] the same description is not trimmed for gemini", () => {
    const { truncated } = applyStyleScaffold(LONG, "gemini");
    expect(truncated).toBe(false);
  });

  /**
   * Trimming used to accept any sentence break past 50% of the budget, so a
   * description whose last full stop fell early lost everything after it — in
   * practice an 800-character allowance producing a 652-character prompt. A
   * clause fragment costs the render less than a missing limb does.
   */
  it("[white-box: boundary] uses nearly all of the budget rather than cutting to an early sentence break", () => {
    // Two sentences: a short one, then a very long one with no internal stop.
    const earlyStop = `A round mossy creature. ${"a leafy frond curling outward ".repeat(40)}`;
    const { prompt, truncated } = applyStyleScaffold(earlyStop, "flux");
    const limit = PROVIDER_PROMPT_LIMIT.flux!;

    expect(truncated).toBe(true);
    expect(prompt.length).toBeLessThanOrEqual(limit);
    // The old 50% rule would have collapsed this to the first sentence.
    expect(prompt.length).toBeGreaterThan(limit * 0.95);
  });
});

/**
 * The avoid-clause leads so the exclusions frame everything after them, rather
 * than arriving after the model has already read what to draw.
 */
describe("clause ordering", () => {
  const DESC = "A round mossy creature with a leafy crest.";

  it("[black-box: spec] gemini prompts open with the avoid-clause", () => {
    const { prompt } = applyStyleScaffold(DESC, "gemini");
    expect(prompt.startsWith("Avoid entirely:")).toBe(true);
  });

  it("[black-box: spec] description precedes the style targets", () => {
    const { prompt } = applyStyleScaffold(DESC, "gemini");
    expect(prompt.indexOf("mossy creature")).toBeLessThan(prompt.indexOf(POSITIVE_STYLE[0]));
  });

  /**
   * Flux gets no avoid-clause at all, so ordering cannot change its prompt —
   * and IMAGE_PROVIDER defaults to flux, which makes this the common path.
   */
  it("[black-box: decision-table] flux prompts still open with the description", () => {
    const { prompt } = applyStyleScaffold(DESC, "flux");
    expect(prompt.startsWith("A round mossy creature")).toBe(true);
    expect(prompt).not.toContain("Avoid entirely");
  });
});
