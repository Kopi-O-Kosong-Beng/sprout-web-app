import sharp from "sharp";
import { SPROUT_PALETTE, SPRITE_SIZE, EvalScores } from "../config";

/**
 * Layer 1 Programmatic Eval: Pure deterministic checks on the finished sprite PNG
 */
export async function programmaticEval(sprite: Buffer): Promise<EvalScores> {
  const { data, info } = await sharp(sprite)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pal = new Set(SPROUT_PALETTE.map(h => h.toUpperCase()));
  let offPalette = 0;
  let opaque = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue; // ignore transparent pixels
    opaque++;
    const hex = ("#" +
      [data[i], data[i + 1], data[i + 2]]
        .map(v => v.toString(16).padStart(2, "0"))
        .join("")
    ).toUpperCase();
    if (!pal.has(hex)) offPalette++;
  }

  const totalPixels = info.width * info.height;

  return {
    paletteValid: offPalette === 0,
    hasAlpha: opaque < totalPixels, // some transparency exists
    notBlank: opaque > totalPixels * 0.05, // at least 5% opaque
    dimsOk: info.width === SPRITE_SIZE && info.height === SPRITE_SIZE,
  };
}
