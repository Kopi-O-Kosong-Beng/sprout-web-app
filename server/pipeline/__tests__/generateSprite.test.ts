import { describe, it, expect, vi, afterEach } from "vitest";
import { generateSprite } from "../stages/generate";

/**
 * Fault injection across the two render providers. Both endpoints are mocked —
 * nothing here reaches NVIDIA or Google.
 *
 * The point of the pair is that they are billed on separate accounts, so one
 * running out of credit should cost latency, not the sprite.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

const fluxOk = () => ({
  ok: true,
  text: () =>
    Promise.resolve(
      JSON.stringify({ artifacts: [{ base64: Buffer.from("flux-bytes").toString("base64") }] }),
    ),
});

const geminiOk = () => ({
  ok: true,
  text: () =>
    Promise.resolve(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                { inlineData: { mimeType: "image/png", data: Buffer.from("gemini-bytes").toString("base64") } },
              ],
            },
          },
        ],
      }),
    ),
});

const failing = (status: number, body: string) => ({
  ok: false,
  status,
  text: () => Promise.resolve(body),
});

const keys = {
  flux: "nvidia-key",
  gemini: "gemini-key",
  geminiModel: "gemini-3.1-flash-image",
  provider: "flux" as const,
};

describe("generateSprite provider fallback", () => {
  it("[fault] primary render provider 402 -> falls through to the other provider", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(failing(402, "Payment Required"))
      .mockResolvedValueOnce(geminiOk());
    vi.stubGlobal("fetch", fetchSpy);

    const result = await generateSprite("a plant creature", keys);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.fromModel).toBe(true);
    expect(result.model).toBe("gemini-3.1-flash-image");
    expect(result.png.toString()).toBe("gemini-bytes");
  });

  it("[decision-table R1] primary succeeds -> secondary never called", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(fluxOk());
    vi.stubGlobal("fetch", fetchSpy);

    const result = await generateSprite("a plant creature", keys);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.model).toBe("black-forest-labs/flux.2-klein-4b");
    expect(result.png.toString()).toBe("flux-bytes");
  });

  it("[fault] every configured provider fails -> throws so the caller can crop", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(failing(500, "upstream down")));

    await expect(generateSprite("a plant creature", keys)).rejects.toThrow();
  });
});
