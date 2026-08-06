import { describe, it, expect, vi } from "vitest";
import {
  craftPromptTiered,
  cleanVlmPromptText,
  buildInstruction,
  nameOnlyPrompt,
} from "../stages/promptCraft";
import { descriptionBudgetFor } from "../promptStyle";
import { GEMINI_TIMEOUT_MS } from "../deadline";

/**
 * Guards the anatomy clause. Stating the body plan as fact ("its stems trail
 * into a curling vine tail") made every species come out with the same two
 * wings and tail, because a VLM transcribes such a clause rather than choosing
 * from it. Both tiers must offer the anatomy as a selection and must name the
 * defaults they are refusing.
 */
describe("prompt anatomy is selected, not prescribed", () => {
  const prescriptive = [
    /its stems trail\w* into a curling vine tail/i,
    /its leaves sprout\w* from the sides like wings/i,
  ];

  for (const [label, text] of [
    ["buildInstruction", buildInstruction("Melastoma")],
    ["nameOnlyPrompt", nameOnlyPrompt("Melastoma")],
  ] as const) {
    it(`[black-box: spec] ${label} does not assert wings and a tail as given`, () => {
      for (const pattern of prescriptive) {
        expect(text).not.toMatch(pattern);
      }
    });

    it(`[black-box: spec] ${label} bounds features to what the plant supports`, () => {
      expect(text).toMatch(/two or three/i);
      expect(text).toMatch(/does not suggest|no wings, tail/i);
    });

    /**
     * Child appeal is carried by design rules, not by naming the genre's famous
     * examples. A named franchise gets the request refused by some image models
     * and gets designs too close to the originals out of the rest.
     */
    it(`[black-box: spec] ${label} states child appeal without naming a franchise`, () => {
      expect(text).toMatch(/young child/i);
      expect(text).toMatch(/oversized head/i);
      expect(text).toMatch(/thumbnail size/i);
      expect(text).not.toMatch(/pok[eé]mon|nintendo|digimon|game freak/i);
    });
  }

  /**
   * The render budget is character-shaped (Flux's 800 minus the style suffix),
   * so the instruction must state an explicit word bound. "2-3 sentences"
   * alone routinely produced 600+ characters, which the render step then
   * trimmed from the tail — where the isolation clause lives.
   */
  it("[black-box: spec] buildInstruction bounds the description length in words", () => {
    expect(buildInstruction("Melastoma")).toMatch(/at most 65 words/i);
  });
});

describe("cleanVlmPromptText", () => {
  it("[black-box: equivalence] strips conversational refusal headers and extracts pure prompt instruction", () => {
    const rawRefusal = `I'm unable to generate an image from this text-based prompt. However, here is the prompt translated into an image generation instruction: Create a chibi-style, 192x192 pixel, pixel-art plant monster sprite with a flat solid white background, using the plant's real colors.`;
    
    const cleaned = cleanVlmPromptText(rawRefusal);
    expect(cleaned).toBe("Create a chibi-style, 192x192 pixel, pixel-art plant monster sprite with a flat solid white background, using the plant's real colors.");
    expect(cleaned).not.toContain("unable to generate");
    expect(cleaned).not.toContain("translated into");
  });
});

/**
 * Tier order is Gemini → NVIDIA → name-only. Gemini leads because the NVIDIA
 * vision model's latency tail (69s-or-timeout when measured) is what used to
 * push runs past the route deadline.
 */
describe("promptCraft tier routing", () => {
  const mocks = (over: Partial<Record<"gemini" | "gemma" | "nameOnly", any>> = {}) => ({
    gemini: over.gemini ?? vi.fn().mockResolvedValue("Gemini prompt output"),
    gemma: over.gemma ?? vi.fn().mockResolvedValue("Gemma prompt output"),
    nameOnly: over.nameOnly ?? vi.fn().mockReturnValue("NameOnly prompt output"),
  });

  it("[black-box: decision-table] returns Tier 1 Gemini when the Gemini call succeeds", async () => {
    const callers = mocks();

    const result = await craftPromptTiered("fake_photo", "Melastoma", "nvidia_key", "gemini_key", callers);

    expect(result.tier).toBe("gemini");
    expect(result.prompt).toBe("Gemini prompt output");
    expect(callers.gemini).toHaveBeenCalled();
    // The slow fallback must not run when the fast path worked.
    expect(callers.gemma).not.toHaveBeenCalled();
  });

  it("[fault-injection] falls back to Tier 2 NVIDIA when Gemini times out", async () => {
    vi.useFakeTimers();

    const callers = mocks({ gemini: vi.fn().mockImplementation(() => new Promise(() => {})) });

    const p = craftPromptTiered("fake_photo", "Melastoma", "nvidia_key", "gemini_key", callers);
    await vi.advanceTimersByTimeAsync(GEMINI_TIMEOUT_MS + 100);

    const result = await p;
    expect(result.tier).toBe("gemma");
    expect(result.prompt).toBe("Gemma prompt output");
    expect(callers.gemma).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("[fault-injection] falls back to Tier 2 NVIDIA when Gemini throws immediately", async () => {
    const callers = mocks({ gemini: vi.fn().mockRejectedValue(new Error("Gemini 429 out of credit")) });

    const result = await craftPromptTiered("fake_photo", "Melastoma", "nvidia_key", "gemini_key", callers);

    expect(result.tier).toBe("gemma");
    expect(result.prompt).toBe("Gemma prompt output");
  });

  it("[white-box: branch] skips Tier 1 entirely when no Gemini key is configured", async () => {
    const callers = mocks();

    const result = await craftPromptTiered("fake_photo", "Melastoma", "nvidia_key", undefined, callers);

    expect(result.tier).toBe("gemma");
    expect(callers.gemini).not.toHaveBeenCalled();
  });

  /**
   * Off-point companion to the timeout case above. That one advances past the
   * cap and asserts the fallback fires; this one stops just short and asserts
   * it does not, which is what pins the boundary rather than merely crossing it.
   */
  it("[white-box: boundary] Gemini answering just under the 20s cap -> no fallback", async () => {
    vi.useFakeTimers();

    const callers = mocks({
      gemini: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve("Gemini prompt output"), GEMINI_TIMEOUT_MS - 100),
          ),
      ),
    });

    const p = craftPromptTiered("fake_photo", "Melastoma", "nvidia_key", "gemini_key", callers);
    await vi.advanceTimersByTimeAsync(GEMINI_TIMEOUT_MS - 50);

    const result = await p;
    expect(result.tier).toBe("gemini");
    expect(callers.gemma).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  /** Neither key present — both tier guards are skipped, not merely failed. */
  it("[white-box: branch] craftPromptTiered: no keys configured -> straight to name-only", async () => {
    const callers = mocks({
      nameOnly: vi.fn().mockReturnValue("An original pixel-art creature drawn from Melastoma"),
    });

    const result = await craftPromptTiered("fake_photo", "Melastoma", undefined, undefined, callers);

    expect(result.tier).toBe("nameOnly");
    expect(callers.gemini).not.toHaveBeenCalled();
    expect(callers.gemma).not.toHaveBeenCalled();
    expect(callers.nameOnly).toHaveBeenCalledWith("Melastoma");
  });

  it("[fault-injection] falls back to Tier 3 nameOnly when both vision models fail", async () => {
    const callers = mocks({
      gemini: vi.fn().mockRejectedValue(new Error("Google down")),
      gemma: vi.fn().mockRejectedValue(new Error("NVIDIA down")),
      nameOnly: vi.fn().mockReturnValue("An original pixel-art creature drawn from Melastoma"),
    });

    const result = await craftPromptTiered("fake_photo", "Melastoma", "nvidia_key", "gemini_key", callers);

    expect(result.tier).toBe("nameOnly");
    expect(result.prompt).toContain("original pixel-art creature");
  });
});

/**
 * When the crafted description overruns what Flux leaves for it, the model
 * rewrites it (feature-aware) before the render step's positional trim ever
 * runs. Compression must never fail the craft — a broken compressor costs
 * nothing but the tail the trim would have taken anyway.
 */
describe("promptCraft render-budget compression", () => {
  const budget = descriptionBudgetFor("flux")!;
  const overlong = "A leafy creature. ".repeat(Math.ceil((budget + 100) / 18)).trim();
  const short = "A leafy creature with a mossy round body.";

  const mocks = (over: Partial<Record<"gemini" | "gemma" | "nameOnly" | "compress", any>> = {}) => ({
    gemini: over.gemini ?? vi.fn().mockResolvedValue(overlong),
    gemma: over.gemma ?? vi.fn().mockResolvedValue(overlong),
    nameOnly: over.nameOnly ?? vi.fn().mockReturnValue("NameOnly prompt output"),
    compress: over.compress ?? vi.fn().mockResolvedValue(short),
  });

  it("[black-box: spec] compresses an over-budget description via the model", async () => {
    const callers = mocks();

    const result = await craftPromptTiered("fake_photo", "Melastoma", "nvidia_key", "gemini_key", callers);

    expect(callers.compress).toHaveBeenCalledWith(
      overlong,
      budget,
      "gemini_key",
      "nvidia_key",
      undefined,
    );
    expect(result.prompt).toBe(short);
    expect(result.tier).toBe("gemini");
  });

  it("[white-box: boundary] a description exactly at budget is not compressed", async () => {
    const atBudget = "x".repeat(budget);
    const callers = mocks({ gemini: vi.fn().mockResolvedValue(atBudget) });

    const result = await craftPromptTiered("fake_photo", "Melastoma", "nvidia_key", "gemini_key", callers);

    expect(callers.compress).not.toHaveBeenCalled();
    expect(result.prompt).toBe(atBudget);
  });

  it("[fault-injection] a failed compression keeps the original prompt and the tier", async () => {
    const callers = mocks({ compress: vi.fn().mockRejectedValue(new Error("out of credit")) });

    const result = await craftPromptTiered("fake_photo", "Melastoma", "nvidia_key", "gemini_key", callers);

    expect(result.prompt).toBe(overlong);
    expect(result.tier).toBe("gemini");
  });

  it("[white-box: branch] a compression that fails to shorten is discarded", async () => {
    const callers = mocks({ compress: vi.fn().mockResolvedValue(overlong + " and more") });

    const result = await craftPromptTiered("fake_photo", "Melastoma", "nvidia_key", "gemini_key", callers);

    expect(result.prompt).toBe(overlong);
  });

  it("[white-box: branch] injected callers without a compressor skip compression", async () => {
    const { compress: _omitted, ...withoutCompress } = mocks();

    const result = await craftPromptTiered(
      "fake_photo",
      "Melastoma",
      "nvidia_key",
      "gemini_key",
      withoutCompress,
    );

    expect(result.prompt).toBe(overlong);
  });

  it("[black-box: spec] compression also guards the NVIDIA tier", async () => {
    const callers = mocks({ gemini: vi.fn().mockRejectedValue(new Error("Google down")) });

    const result = await craftPromptTiered("fake_photo", "Melastoma", "nvidia_key", "gemini_key", callers);

    expect(result.tier).toBe("gemma");
    expect(result.prompt).toBe(short);
  });
});
