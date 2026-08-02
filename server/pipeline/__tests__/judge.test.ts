import { describe, it, expect, vi, afterEach } from "vitest";
import { geminiJudgeEval } from "../eval/judge";
import { createDeadline } from "../deadline";

/**
 * The judge is the last hop and runs after the sprite is already finished, so
 * every failure mode here must return {} ("not scored") rather than throw or
 * hang. A judge problem must never be able to cost a sprite that already exists.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const sprite = Buffer.from("fake-png-bytes");

const geminiText = (text: string) => ({
  ok: true,
  json: () =>
    Promise.resolve({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] }),
});

describe("geminiJudgeEval", () => {
  it("[black-box: equivalence] parses the four axes from a clean JSON reply", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        geminiText('{"cute": 5, "resemblance": 4, "edges": 3, "style": 2}'),
      ),
    );

    const scores = await geminiJudgeEval(sprite, "Melastoma", "key");

    expect(scores).toEqual({
      judgeCute: 5,
      judgeResemblance: 4,
      judgeEdges: 3,
      judgeStyle: 2,
    });
  });

  it("[white-box: branch] reports 'not scored' rather than a passing grade when no key is set", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    expect(await geminiJudgeEval(sprite, "Melastoma", "")).toEqual({});
    expect(await geminiJudgeEval(sprite, "Melastoma", "MOCK_KEY")).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  /**
   * A safety block returns HTTP 200 with a candidate carrying finishReason and
   * no parts. This used to land on "returned no JSON object", which reads as a
   * formatting quirk and points at the prompt instead of at the block.
   */
  it("[fault-injection] names the finishReason when the model returns no text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ candidates: [{ finishReason: "SAFETY" }] }),
      }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await geminiJudgeEval(sprite, "Melastoma", "key")).toEqual({});
    expect(warn.mock.calls.flat().join(" ")).toContain("SAFETY");
  });

  /** A prompt-level block returns promptFeedback and no candidate at all. */
  it("[fault-injection] names the blockReason when the prompt itself is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ promptFeedback: { blockReason: "PROHIBITED_CONTENT" } }),
      }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await geminiJudgeEval(sprite, "Melastoma", "key")).toEqual({});
    expect(warn.mock.calls.flat().join(" ")).toContain("PROHIBITED_CONTENT");
  });

  it("[white-box: boundary] does not turn an explicit 0 into a pass", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        geminiText('{"cute": 0, "resemblance": 0, "edges": 0, "style": 0}'),
      ),
    );

    const scores = await geminiJudgeEval(sprite, "Melastoma", "key");
    expect(scores.judgeCute).toBe(0);
  });

  it("[fault-injection] swallows a network failure rather than losing the sprite", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket hang up")));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(geminiJudgeEval(sprite, "Melastoma", "key")).resolves.toEqual({});
  });

  /**
   * The judge was the last hop with no ceiling. An exhausted budget must skip it
   * outright — not start a call whose only possible outcome is eating the
   * remaining time on a sprite that is already finished.
   */
  it("[white-box: boundary] skips entirely when the route budget is already spent", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const spent = createDeadline(0);
    expect(await geminiJudgeEval(sprite, "Melastoma", "key", spent)).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("[white-box: branch] passes an abort signal when a deadline is supplied", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(geminiText('{"cute": 4}'));
    vi.stubGlobal("fetch", fetchSpy);

    await geminiJudgeEval(sprite, "Melastoma", "key", createDeadline(60_000));

    expect(fetchSpy.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});
