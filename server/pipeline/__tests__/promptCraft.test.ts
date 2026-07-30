import { describe, it, expect, vi } from "vitest";
import { craftPromptTiered, cleanVlmPromptText } from "../stages/promptCraft";
import { GEMINI_TIMEOUT_MS } from "../deadline";

describe("cleanVlmPromptText", () => {
  it("strips conversational refusal headers and extracts pure prompt instruction", () => {
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

  it("returns Tier 1 Gemini when the Gemini call succeeds", async () => {
    const callers = mocks();

    const result = await craftPromptTiered("fake_photo", "Melastoma", "nvidia_key", "gemini_key", callers);

    expect(result.tier).toBe("gemini");
    expect(result.prompt).toBe("Gemini prompt output");
    expect(callers.gemini).toHaveBeenCalled();
    // The slow fallback must not run when the fast path worked.
    expect(callers.gemma).not.toHaveBeenCalled();
  });

  it("falls back to Tier 2 NVIDIA when Gemini times out", async () => {
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

  it("falls back to Tier 2 NVIDIA when Gemini throws immediately", async () => {
    const callers = mocks({ gemini: vi.fn().mockRejectedValue(new Error("Gemini 429 out of credit")) });

    const result = await craftPromptTiered("fake_photo", "Melastoma", "nvidia_key", "gemini_key", callers);

    expect(result.tier).toBe("gemma");
    expect(result.prompt).toBe("Gemma prompt output");
  });

  it("skips Tier 1 entirely when no Gemini key is configured", async () => {
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
  it("[BVA] Gemini answering just under the 20s cap -> no fallback", async () => {
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
  it("[path] craftPromptTiered: no keys configured -> straight to name-only", async () => {
    const callers = mocks({
      nameOnly: vi.fn().mockReturnValue("An original pixel-art creature drawn from Melastoma"),
    });

    const result = await craftPromptTiered("fake_photo", "Melastoma", undefined, undefined, callers);

    expect(result.tier).toBe("nameOnly");
    expect(callers.gemini).not.toHaveBeenCalled();
    expect(callers.gemma).not.toHaveBeenCalled();
    expect(callers.nameOnly).toHaveBeenCalledWith("Melastoma");
  });

  it("falls back to Tier 3 nameOnly when both vision models fail", async () => {
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
