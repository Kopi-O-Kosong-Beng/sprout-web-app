/**
 * The client's view of the pipeline's tunables.
 *
 * The canonical copy is `server/pipeline/config.ts` — that is the one the
 * pipeline actually quantises against, and the one the pipeline tests assert on.
 * The studio only needs the palette, to draw the swatch strip that shows what
 * the sprites were snapped to, so this is a presentation constant rather than a
 * second source of truth. The same 24 values are also declared as
 * `--color-f24-*` design tokens in index.css.
 */

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

export type PipelineTier = 'gemma' | 'gemini' | 'nameOnly' | 'photoCrop';
