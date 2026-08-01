import { describe, it, expect } from "vitest";
import { assemblePlant } from "../stages/assemble";

describe("assemblePlant", () => {
  it("creates a plant with maxHealth = 100, speed in range 5-20, and 4 moves", () => {
    const identification = {
      name: "Polygala calcarea",
      probability: 0.95,
      common_names: ["chalk milkwort"],
      taxonomy: { Kingdom: "Plantae", Order: "Fabales", Family: "Polygalaceae" },
      description: "Chalk milkwort description",
    };

    const plant = assemblePlant(identification, "https://example.com/sprite.png");

    expect(plant.name).toBe("Polygala calcarea");
    expect(plant.maxHealth).toBe(100);
    expect(plant.speed).toBeGreaterThanOrEqual(5);
    expect(plant.speed).toBeLessThanOrEqual(20);
    expect(plant.moves).toHaveLength(4);
    expect(plant.spriteUrl).toBe("https://example.com/sprite.png");
  });

  it("uses default move set on manual name or unknown taxonomy path", () => {
    const identification = {
      name: "Unknown Plant",
    };

    const plant = assemblePlant(identification, "https://example.com/sprite.png");

    expect(plant.moves).toHaveLength(4);
    expect(plant.moves.map((m) => m.name)).toContain("Tackle");
    expect(plant.moves.map((m) => m.name)).toContain("Vine Whip");
  });
});
