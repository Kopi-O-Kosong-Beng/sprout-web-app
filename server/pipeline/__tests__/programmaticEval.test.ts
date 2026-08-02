import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { programmaticEval } from "../eval/programmatic";
import { SPROUT_PALETTE, SPRITE_SIZE } from "../config";

describe("programmaticEval", () => {
  it("[black-box: equivalence] passes a clean on-palette sprite with transparency", async () => {
    // Create an image where center is opaque and outer border is transparent
    const width = 192;
    const height = 192;
    const buffer = Buffer.alloc(width * height * 4);

    const validRgb = [
      parseInt(SPROUT_PALETTE[0].slice(1, 3), 16),
      parseInt(SPROUT_PALETTE[0].slice(3, 5), 16),
      parseInt(SPROUT_PALETTE[0].slice(5, 7), 16),
    ];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        // Center box is opaque
        if (x >= 40 && x <= 150 && y >= 40 && y <= 150) {
          buffer[idx] = validRgb[0];
          buffer[idx + 1] = validRgb[1];
          buffer[idx + 2] = validRgb[2];
          buffer[idx + 3] = 255;
        } else {
          buffer[idx + 3] = 0; // transparent
        }
      }
    }

    const pngBuffer = await sharp(buffer, { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer();

    const result = await programmaticEval(pngBuffer);
    expect(result.paletteValid).toBe(true);
    expect(result.dimsOk).toBe(true);
    expect(result.hasAlpha).toBe(true);
    expect(result.notBlank).toBe(true);
  });

  /**
   * The invalid-dimensions class. Every other case in this file feeds a
   * 192x192 buffer, so dimsOk was true in all of them and nothing distinguished
   * the real check from a hardcoded `true` — the gate in approve.test.ts covers
   * what happens when dimsOk is false, but not that anything can produce it.
   *
   * The other three flags are asserted true on purpose: dimsOk has to fail on
   * its own, not as a side effect of an otherwise broken sprite.
   */
  it("[black-box: equivalence] off-size sprite fails dimsOk while every other check still passes", async () => {
    const size = 128; // on-palette and well-formed, just not 192x192
    const buffer = Buffer.alloc(size * size * 4);

    const validRgb = [
      parseInt(SPROUT_PALETTE[0].slice(1, 3), 16),
      parseInt(SPROUT_PALETTE[0].slice(3, 5), 16),
      parseInt(SPROUT_PALETTE[0].slice(5, 7), 16),
    ];

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        // Opaque centre well over the 5% notBlank floor, transparent border.
        if (x >= 20 && x <= 107 && y >= 20 && y <= 107) {
          buffer[idx] = validRgb[0];
          buffer[idx + 1] = validRgb[1];
          buffer[idx + 2] = validRgb[2];
          buffer[idx + 3] = 255;
        } else {
          buffer[idx + 3] = 0;
        }
      }
    }

    const pngBuffer = await sharp(buffer, { raw: { width: size, height: size, channels: 4 } })
      .png()
      .toBuffer();

    const result = await programmaticEval(pngBuffer);
    expect(result.dimsOk).toBe(false);
    expect(result.paletteValid).toBe(true);
    expect(result.hasAlpha).toBe(true);
    expect(result.notBlank).toBe(true);
  });

  it("[black-box: equivalence] fails a blank (all transparent) sprite", async () => {
    const blankPng = await sharp({
      create: {
        width: SPRITE_SIZE,
        height: SPRITE_SIZE,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();

    const result = await programmaticEval(blankPng);
    expect(result.notBlank).toBe(false);
  });
});
