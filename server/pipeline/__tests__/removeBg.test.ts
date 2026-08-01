import { describe, it, expect, vi, afterEach } from "vitest";
import { removeBackgroundSafe } from "../stages/removeBg";
import { MIN_USEFUL_CUTOUT_MS } from "../deadline";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Deadline stub with a fixed remaining budget. */
const deadlineWith = (remainingMs: number) =>
  ({
    remainingMs: () => remainingMs,
    signal: () => AbortSignal.timeout(30_000),
  }) as any;

describe("removeBackgroundSafe", () => {
  it("degrades gracefully to original buffer and sets removeBgOk = false when key is missing or call fails", async () => {
    const inputBuffer = Buffer.from("dummy_png_bytes");

    // Call without key
    const res1 = await removeBackgroundSafe(inputBuffer);
    expect(res1.removeBgOk).toBe(false);
    expect(res1.png.toString()).toBe("dummy_png_bytes");

    // Call with mock failing fetch
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 402,
        text: () => Promise.resolve("Insufficient credits"),
      })
    );

    const res2 = await removeBackgroundSafe(inputBuffer, "invalid_key");
    expect(res2.removeBgOk).toBe(false);
    expect(res2.png.toString()).toBe("dummy_png_bytes");

    vi.unstubAllGlobals();
  });

  /**
   * The floor exists so we never start a call that cannot finish. Below it the
   * hop is skipped without spending a request; above it the call is attempted.
   */
  it("[BVA] budget just below the 8s floor skips the call entirely", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await removeBackgroundSafe(
      Buffer.from("raw_render"),
      "valid_key",
      deadlineWith(MIN_USEFUL_CUTOUT_MS - 1),
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.removeBgOk).toBe(false);
    expect(result.png.toString()).toBe("raw_render");
  });

  it("[BVA] budget just above the 8s floor still attempts the call", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          img_without_background_base64: Buffer.from("cutout").toString("base64"),
        }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await removeBackgroundSafe(
      Buffer.from("raw_render"),
      "valid_key",
      deadlineWith(MIN_USEFUL_CUTOUT_MS + 1),
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.removeBgOk).toBe(true);
    expect(result.png.toString()).toBe("cutout");
  });

  /**
   * The companion assertion to the 429 case below, and the reason it exists:
   * the end state of a 402 and a 429 is identical — raw render, removeBgOk
   * false — so asserting only the result cannot tell a permanent failure from a
   * retried one. Dropping 402 out of PERMANENT costs three calls instead of one
   * against a dead key, and nothing above would have noticed. The call count is
   * the only observable that distinguishes them.
   */
  it("[fault] 402 out-of-credit is permanent — one attempt, no retries", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      text: () => Promise.resolve("Insufficient credits"),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await removeBackgroundSafe(Buffer.from("raw_render"), "valid_key");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.removeBgOk).toBe(false);
    expect(result.png.toString()).toBe("raw_render");
  });

  /**
   * 429 is transient, unlike the 402 above — it must exhaust all three attempts
   * before giving up, and still hand back the raw render rather than throwing.
   */
  it("[fault] 429 rate-limit retries three times then keeps the raw render", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve("Too Many Requests"),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await removeBackgroundSafe(Buffer.from("raw_render"), "valid_key");

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(result.removeBgOk).toBe(false);
    expect(result.png.toString()).toBe("raw_render");
  });
});
