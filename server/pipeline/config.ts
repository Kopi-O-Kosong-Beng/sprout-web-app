// Config block - Single source of truth for Sprout AI Pipeline tunables

/*
 * Per-hop timeouts are not here — they live in pipeline/deadline.ts, which owns
 * the whole route budget and hands each hop the smaller of its own ceiling and
 * whatever is left. A standalone constant here would be a second, unenforced
 * opinion about the same number.
 */

/*
 * Model IDs used to live here and had all drifted from what the code called:
 * GEMMA_MODEL named Gemma but pointed at Llama, NANO_BANANA named Nano Banana
 * but pointed at Imagen, and GEMINI_VLM pointed at gemini-2.0-flash, which is
 * retired and 404s. They now live in server/env.ts, overridable per deployment
 * so a retired model is a config change rather than a code change.
 */

export const SPRITE_SIZE = 192;

/**
 * Spica 72 by A Blurby Sir (Lospec: /palette-list/spica-72). 72 colours.
 *
 * Replaces Florentine24, which was too tight a target: every opaque pixel snaps
 * to its nearest entry, so 24 colours flattened distinct species toward the same
 * handful of hues and cost the shading steps the sprite style asks for. Three
 * times the entries — with proper grey, blue, green and skin ramps — leaves the
 * snap in place while giving it somewhere to land.
 *
 * Note this is still an exact snap: programmatic.ts requires *zero* off-palette
 * pixels. Widening the palette relaxes what the sprite may contain; it does not
 * relax the check. Loosening that too is a separate change, and it would mean
 * revisiting `paletteValid: offPalette === 0` and the approval gate that reads
 * it, or every sprite fails.
 *
 * Ordered as published, in ramps: greys, golds, reds, browns, blues/cyans,
 * purples/pinks, teals, greens, and a final yellow-green run. Nothing addresses
 * this array by index — see nearestPaletteHex below for why.
 */
export const SPROUT_PALETTE: string[] = [
  "#000000", "#262626", "#4D4D4D", "#737373", "#999999", "#BFBFBF",
  "#DEDEDE", "#FFFFFF", "#FFD000", "#DE9B0B", "#BF7113", "#995526",
  "#733922", "#260E10", "#4D182A", "#731E31", "#99202C", "#BF140A",
  "#DE2800", "#FF5100", "#4D2A1F", "#734634", "#99664D", "#BF8A69",
  "#DEAA85", "#FFCEA6", "#171921", "#372E4D", "#483F73", "#504D99",
  "#565FBF", "#5976DE", "#5991FF", "#59F7FF", "#59C8DE", "#56A2BF",
  "#4D7999", "#3F5673", "#2E394D", "#4D2E4B", "#733F6A", "#994D83",
  "#BF5693", "#DE5995", "#FF6699", "#59FF9D", "#59DEA1", "#56BF9A",
  "#4D9988", "#3F736E", "#2E4C4D", "#172121", "#1B4D3E", "#227353",
  "#26995E", "#26BF5E", "#21DE50", "#26FF43", "#7AE67F", "#6AC87A",
  "#60AC75", "#518A68", "#254D1B", "#3D7322", "#5A9926", "#7DBF26",
  "#A1DE21", "#D0FF26", "#C6E67A", "#A1C86A", "#82AC60", "#678A51",
];

/**
 * Resolves a desired colour to the closest entry in SPROUT_PALETTE.
 *
 * Exists so nothing has to address the palette by index. Bare indices
 * (`SPROUT_PALETTE[8]`) are how the procedural placeholder broke the last time
 * the palette changed: the numbers stayed valid, so nothing errored, and
 * melastoma simply started rendering near-black instead of magenta. Asking for
 * "the closest thing to magenta" survives a reordering; asking for "entry 8"
 * does not.
 *
 * Plain squared-RGB distance. Not perceptually uniform, but the callers are
 * picking broad hues from a well-spread ramp, where the extra precision of a
 * Lab-space match would change nothing.
 */
export function nearestPaletteHex(targetHex: string): string {
  const toRgb = (hex: string) => {
    const n = parseInt(hex.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };

  const [tr, tg, tb] = toRgb(targetHex);
  let best = SPROUT_PALETTE[0];
  let bestDistance = Infinity;

  for (const candidate of SPROUT_PALETTE) {
    const [r, g, b] = toRgb(candidate);
    const distance = (r - tr) ** 2 + (g - tg) ** 2 + (b - tb) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best;
}

export const AUTO_APPROVE_JUDGE_MIN = 4;

export interface EvalScores {
  paletteValid: boolean;
  hasAlpha: boolean;
  notBlank: boolean;
  dimsOk: boolean;
  judgeCute?: number;
  judgeResemblance?: number;
  judgeEdges?: number;
  judgeStyle?: number;
}

export type PipelineTier = "gemma" | "gemini" | "nameOnly" | "photoCrop";
