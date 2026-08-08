import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { finishSprite, cropPhoto } from "../stages/finish";
import { SPROUT_PALETTE, SPRITE_SIZE } from "../config";

async function createSolidPng(hexColor: string, width = 300, height = 300, alpha = 1): Promise<Buffer> {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r, g, b, alpha },
    },
  })
    .png()
    .toBuffer();
}

describe("finishSprite", () => {
  it("[black-box: equivalence] snaps every opaque pixel into SPROUT_PALETTE and sets dimensions to 192x192", async () => {
    // Near bloom pink #E9487F (slightly off palette)
    const nearColor = "#E9487F";
    const input = await createSolidPng(nearColor, 256, 256, 1);
    const output = await finishSprite(input);

    const { data, info } = await sharp(output)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const palSet = new Set(SPROUT_PALETTE.map((h) => h.toUpperCase()));

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const hex = (
        "#" +
        [data[i], data[i + 1], data[i + 2]]
          .map((v) => v.toString(16).padStart(2, "0"))
          .join("")
      ).toUpperCase();
      expect(palSet.has(hex)).toBe(true);
    }

    expect(info.width).toBe(SPRITE_SIZE);
    expect(info.height).toBe(SPRITE_SIZE);
  });

  it("[black-box: equivalence] preserves transparent pixels", async () => {
    const transparentInput = await sharp({
      create: {
        width: 300,
        height: 300,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();

    const output = await finishSprite(transparentInput);
    const { data } = await sharp(output)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let hasTransparent = false;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 128) {
        hasTransparent = true;
        break;
      }
    }
    expect(hasTransparent).toBe(true);
  });

  it("[black-box: equivalence] drops stray islands that are disconnected from the main subject", async () => {
    // A big opaque block plus a small detached one, on transparency — the shape
    // withoutBG leaves when it fails to trim a corner.
    const W = 256;
    const raw = Buffer.alloc(W * W * 4, 0);
    const paint = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * W + x) * 4;
          raw[i] = 0xff;
          raw[i + 1] = 0xff;
          raw[i + 2] = 0xff;
          raw[i + 3] = 255;
        }
      }
    };
    paint(100, 100, 200, 200); // main subject, 100x100
    paint(10, 10, 30, 30); //     detached island, 20x20, well clear of it

    const input = await sharp(raw, { raw: { width: W, height: W, channels: 4 } })
      .png()
      .toBuffer();

    const { data } = await sharp(await finishSprite(input))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Sample the middle of each block after the 256 -> 192 downscale.
    const at = (x: number, y: number) => data[(Math.round(y * 0.75) * SPRITE_SIZE + Math.round(x * 0.75)) * 4 + 3];

    expect(at(150, 150)).toBeGreaterThan(128); // subject survives
    expect(at(20, 20)).toBe(0); //                island removed
  });

  /**
   * finishSprite's palette loop branches on `alpha < 128`. 127 and 128 are the
   * two values either side of that comparison, so this pins the branch itself
   * rather than a comfortably-opaque or comfortably-clear pixel.
   *
   * This used to assert that a pixel below the cutoff was LEFT ALONE — which
   * was the halo bug written down as a requirement. A pixel at alpha 1..127 is
   * not transparent, it is partly visible carrying a colour blended with the
   * white backdrop, and keeping it produced the pale rim around every sprite.
   * The contract now is that no pixel survives partly transparent at all.
   */
  it("[white-box: boundary] alpha 127 is cleared, 128 is snapped and made opaque", async () => {
    const W = 8;
    const raw = Buffer.alloc(W * W * 4, 0);
    // An off-palette colour so a snap is observable if it happens.
    const OFF = [233, 72, 127];

    for (let i = 0; i < W * W; i++) {
      const p = i * 4;
      raw[p] = OFF[0];
      raw[p + 1] = OFF[1];
      raw[p + 2] = OFF[2];
      // Left half just below the threshold, right half exactly on it.
      raw[p + 3] = i % W < W / 2 ? 127 : 128;
    }

    const input = await sharp(raw, { raw: { width: W, height: W, channels: 4 } })
      .png()
      .toBuffer();

    const { data } = await sharp(await finishSprite(input))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const palette = new Set(
      SPROUT_PALETTE.map((h) => h.toUpperCase()),
    );
    const hexAt = (i: number) =>
      ('#' +
        [data[i], data[i + 1], data[i + 2]]
          .map((v) => v.toString(16).padStart(2, '0'))
          .join('')).toUpperCase();

    let sawOpaque = false;
    let sawCleared = false;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      // The whole point: nothing lands between the two extremes.
      expect(alpha === 0 || alpha === 255).toBe(true);

      if (alpha === 255) {
        // The 128 side: decontaminated, then snapped onto the palette.
        expect(palette.has(hexAt(i))).toBe(true);
        sawOpaque = true;
      } else {
        sawCleared = true;
      }
    }

    // Both sides of the boundary have to be represented, or the test is
    // asserting one branch twice.
    expect(sawOpaque).toBe(true);
    expect(sawCleared).toBe(true);
  });

  /*
    The halo, stated directly.

    Matting returns a soft edge: a ring of pixels whose colour is part creature,
    part backdrop, and whose alpha says how much of each. Left as-is they render
    as a pale rim — the "weird blend of background and sprite" this was reported
    as. Nothing may survive partly transparent.
  */
  it("[black-box] leaves no partly transparent pixel anywhere", async () => {
    const W = 16;
    const raw = Buffer.alloc(W * W * 4, 0);
    for (let i = 0; i < W * W; i++) {
      const p = i * 4;
      raw[p] = 60;
      raw[p + 1] = 160;
      raw[p + 2] = 70;
      // A full sweep of alphas, so every band the old code treated
      // differently is present in one image.
      raw[p + 3] = Math.round((i / (W * W - 1)) * 255);
    }
    const input = await sharp(raw, { raw: { width: W, height: W, channels: 4 } })
      .png()
      .toBuffer();

    const { data } = await sharp(await finishSprite(input))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const partial: number[] = [];
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha !== 0 && alpha !== 255) partial.push(alpha);
    }

    expect(partial).toEqual([]);
  });

  /*
    Decontamination, which is the other half of the fix.

    A pixel at alpha 128 against a white backdrop is roughly half white. Snapped
    without correcting for that, it picks a palette entry lighter than the
    creature actually is, and the silhouette gets a bright outline even once the
    alpha is hardened. The recovered colour must be nearer the true one than the
    blended colour was.
  */
  it("[white-box] removes the white mixed into a semi-transparent pixel", async () => {
    const W = 8;
    const TRUE_COLOUR = [40, 120, 60];
    const raw = Buffer.alloc(W * W * 4, 0);
    for (let i = 0; i < W * W; i++) {
      const p = i * 4;
      // What matting hands back for a half-covered pixel: the true colour
      // mixed 50/50 with the white backdrop.
      raw[p] = Math.round(0.5 * TRUE_COLOUR[0] + 0.5 * 255);
      raw[p + 1] = Math.round(0.5 * TRUE_COLOUR[1] + 0.5 * 255);
      raw[p + 2] = Math.round(0.5 * TRUE_COLOUR[2] + 0.5 * 255);
      raw[p + 3] = 128;
    }
    const input = await sharp(raw, { raw: { width: W, height: W, channels: 4 } })
      .png()
      .toBuffer();

    const { data } = await sharp(await finishSprite(input))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Compare against what the blended colour would have snapped to. The
    // recovered pixel must be closer to the true colour than that was.
    const distance = (c: number[]) =>
      (c[0] - TRUE_COLOUR[0]) ** 2 +
      (c[1] - TRUE_COLOUR[1]) ** 2 +
      (c[2] - TRUE_COLOUR[2]) ** 2;
    const blended = [148, 188, 158];

    const got = [data[0], data[1], data[2]];
    expect(data[3]).toBe(255);
    expect(distance(got)).toBeLessThan(distance(blended));
  });

  it("[black-box: equivalence] crops photo to 192x192 PNG buffer for Tier 4 fallback", async () => {
    const photoB64 = (await createSolidPng("#51B341", 400, 300)).toString("base64");
    const cropped = await cropPhoto(photoB64);
    
    const metadata = await sharp(cropped).metadata();
    expect(metadata.width).toBe(SPRITE_SIZE);
    expect(metadata.height).toBe(SPRITE_SIZE);
    expect(metadata.format).toBe("png");
  });
});
