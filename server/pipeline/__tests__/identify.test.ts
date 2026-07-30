import { describe, it, expect, vi, afterEach } from "vitest";
import { identifyPlant } from "../stages/identify";

/**
 * Equivalence partitioning over the image input class, per TC-UC6-01/02.
 *
 * Plant.id is mocked — no test here makes a real call. The partitions that
 * this repository actually implements are "identified plant" and "not a
 * plant"; see the audit notes for the classes the production code does not
 * yet distinguish (low-confidence and invalid-format).
 */

const KEY = "test-plant-key";

const plantIdResponse = (over: Record<string, unknown> = {}) => ({
  ok: true,
  text: () => Promise.resolve(""),
  json: () =>
    Promise.resolve({
      result: {
        is_plant: { binary: true, probability: 0.99 },
        classification: {
          suggestions: [
            {
              name: "Melastoma malabathricum",
              probability: 0.93,
              details: {
                common_names: ["Singapore rhododendron"],
                taxonomy: { genus: "Melastoma", family: "Melastomataceae" },
              },
            },
          ],
        },
        ...over,
      },
    }),
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("identifyPlant input classes", () => {
  it("[EP] valid plant photo -> identified with taxonomy", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(plantIdResponse()));

    const result = await identifyPlant("data:image/jpeg;base64,AAAA", KEY);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.name).toBe("Melastoma malabathricum");
    expect(result.probability).toBeCloseTo(0.93);
    expect(result.taxonomy.genus).toBe("Melastoma");
  });

  it("[EP] non-plant photo -> needsName, no classification returned", async () => {
    // The Lego-plant class: plant-shaped, but is_plant says no.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        plantIdResponse({ is_plant: { binary: false, probability: 0.04 } }),
      ),
    );

    const result = await identifyPlant("data:image/jpeg;base64,AAAA", KEY);

    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.needsName).toBe(true);
    expect(result.error).toMatch(/not identified as a plant/i);
  });
});
