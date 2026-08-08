import sharp from "sharp";
import { SPROUT_PALETTE, SPRITE_SIZE } from "../config";

/** Alpha at or below this counts as background for the connected-region pass. */
const OPAQUE_THRESHOLD = 32;

/**
 * Where a partly transparent pixel is rounded to: above this it becomes fully
 * opaque, below it becomes fully clear. No pixel keeps a value in between.
 *
 * 128 deliberately, because programmaticEval counts a pixel as opaque on the
 * same test. Rounding to any other cutoff would move pixels across its
 * boundary and change `notBlank`/`hasAlpha` for reasons that have nothing to
 * do with the sprite.
 */
const ALPHA_CUTOFF = 128;

/**
 * The backdrop the render was produced against.
 *
 * promptCraft demands a "pure-white background" in three separate places, so an
 * edge pixel that came back semi-transparent is a blend of the creature and
 * white — and how much white is exactly what its alpha records.
 */
const RENDER_BACKDROP = 255;

/**
 * How far (Euclidean, RGB) a pixel may sit from the white backdrop and still
 * count as backdrop for the border fill. The same tolerance the backdrop
 * experiment measured compliance with — generous, because a diffusion model
 * does not emit a mathematically flat colour field. The creature's own white
 * pixels are protected by the outline wall, not by this number.
 */
const BACKDROP_KEY_TOLERANCE = 60;

/**
 * Recovers a pixel's true colour by removing the backdrop mixed into it.
 *
 * Matting returns the OBSERVED colour: `observed = a·true + (1−a)·backdrop`.
 * Rearranged, `true = (observed − (1−a)·backdrop) / a`. Without this a pixel at
 * alpha 200 is 22% white, and the palette snap below picks a lighter entry than
 * the creature actually has — a pale rim one pixel wide around the silhouette.
 *
 * Only ever called for pixels at or above ALPHA_CUTOFF, so the divisor is never
 * below 0.5 and this amplifies noise by at most 2x. Applying it to a nearly
 * transparent pixel would amplify by up to 255x and invent colours; those
 * pixels are discarded instead.
 */
function decontaminate(channel: number, alpha: number): number {
  if (alpha >= 255) return channel;
  const a = alpha / 255;
  const recovered = (channel - (1 - a) * RENDER_BACKDROP) / a;
  return Math.max(0, Math.min(255, Math.round(recovered)));
}

export interface FinishOptions {
  /**
   * Clears backdrop-white that survived matting, by flood-filling inward from
   * the frame edge. Only set this when withoutBG returned a REAL cutout
   * (removeBgOk): on a passthrough render the honest degradation is the white
   * background staying visibly baked in, which is what the golden set's
   * edge_removebg_degraded case asserts (hasAlpha: false).
   */
  keyBackdrop?: boolean;
}

/**
 * Step 1 / §3d: finishSprite
 *
 * Downscales to 192x192 with a nearest-neighbour kernel, optionally clears
 * border-connected backdrop the matting missed, drops every opaque region
 * except the largest, then snaps the survivors to SPROUT_PALETTE.
 *
 * `fit: "contain"` rather than "cover": cover crops to fill, which lopped the
 * top off tall sprites (a leaf crown, a plume). Contain letterboxes into
 * transparency instead, so the creature arrives whole and the dimensions stay
 * exactly 192x192 for programmaticEval's dimsOk check.
 */
export async function finishSprite(png: Buffer, options?: FinishOptions): Promise<Buffer> {
  const { data, info } = await sharp(png)
    .resize(SPRITE_SIZE, SPRITE_SIZE, {
      kernel: "nearest",
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (options?.keyBackdrop) {
    clearBorderConnectedBackdrop(data, info.width, info.height);
  }

  removeStrayIslands(data, info.width, info.height);

  const pal = SPROUT_PALETTE.map(hex => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]);

  /*
    Decontaminate, snap, then harden the alpha.

    The previous version skipped every pixel under alpha 128 with the comment
    "leave transparent pixels" — but a pixel at alpha 1..127 is not
    transparent, it is PARTLY VISIBLE and its colour is a blend of the creature
    and the white backdrop. Skipping it kept both the contaminated colour and
    the partial visibility, which is the pale halo that appeared around every
    sprite. Measured on live sprites: ~100 such pixels each, plus ~300 more at
    alpha 128..254 that were snapped but left semi-transparent.

    Soft edges were the odd one out here anyway. This function downscales with
    a nearest-neighbour kernel and quantises every colour to a fixed palette;
    an anti-aliased alpha channel was the single place it still allowed an
    in-between value.
  */
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];

    if (alpha < ALPHA_CUTOFF) {
      // Not "already transparent" — made transparent, which is the fix.
      data[i + 3] = 0;
      continue;
    }

    const r = decontaminate(data[i], alpha);
    const g = decontaminate(data[i + 1], alpha);
    const b = decontaminate(data[i + 2], alpha);

    let best = 0, bestD = Infinity;
    for (let p = 0; p < pal.length; p++) {
      const dr = r - pal[p][0];
      const dg = g - pal[p][1];
      const db = b - pal[p][2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    data[i] = pal[best][0];
    data[i + 1] = pal[best][1];
    data[i + 2] = pal[best][2];
    data[i + 3] = 255;
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

/**
 * Clears backdrop-white the matting failed to remove, by flood-filling inward
 * from the frame edge.
 *
 * The problem this solves (md/PLANT_DETAILS.md): white is distance 0 from
 * SPROUT_PALETTE — it IS palette entry #FFFFFF — so leftover backdrop snaps to
 * exactly the same value as a legitimately white plant pixel and no colour
 * test can tell them apart. Portulaca grandiflora shipped as a white creature
 * on ~7,500 px of surviving white field. Rendering against a chroma-key
 * backdrop instead was measured and ruled out: Flux ignores the instruction
 * outright (see scripts/backdrop-experiment.ts).
 *
 * Connectivity is what colour cannot be. The fill starts at the frame edge and
 * traverses two kinds of pixel: the transparent moat matting DID produce, and
 * anything backdrop-coloured. Every backdrop-coloured pixel it reaches is
 * cleared. The creature's bold black outline — which the style already demands
 * — is a wall the fill cannot cross, so interior whites (measured 7,853 px on
 * the same Portulaca) are untouchable no matter how generous the colour
 * tolerance is. Measured on the prototype: all 7,547 border-reachable
 * backdrop pixels cleared, all 7,853 interior whites kept.
 *
 * This is deliberately NOT the reverted corner-colour keyer: that one matched
 * on colour alone with no connectivity, so a sprite touching the frame edge
 * lost chunks of itself. Here a white region survives unless the background
 * can actually reach it.
 *
 * Mutates `data` (RGBA) in place. 4-connectivity, iterative, same shape as
 * removeStrayIslands below.
 */
function clearBorderConnectedBackdrop(data: Buffer, width: number, height: number): void {
  const count = width * height;

  // Pixels the hardening loop later makes fully transparent are already
  // background as far as the fill is concerned — that is the moat.
  const isMoat = (p: number) => data[p * 4 + 3] < ALPHA_CUTOFF;

  const isBackdropColour = (p: number) => {
    const i = p * 4;
    const dr = RENDER_BACKDROP - data[i];
    const dg = RENDER_BACKDROP - data[i + 1];
    const db = RENDER_BACKDROP - data[i + 2];
    return dr * dr + dg * dg + db * db <= BACKDROP_KEY_TOLERANCE * BACKDROP_KEY_TOLERANCE;
  };

  const visited = new Uint8Array(count);
  const stack: number[] = [];
  const seed = (p: number) => {
    if (!visited[p] && (isMoat(p) || isBackdropColour(p))) {
      visited[p] = 1;
      stack.push(p);
    }
  };

  for (let x = 0; x < width; x++) {
    seed(x);
    seed(count - width + x);
  }
  for (let y = 0; y < height; y++) {
    seed(y * width);
    seed(y * width + width - 1);
  }

  while (stack.length > 0) {
    const p = stack.pop()!;
    // Reachable from the border without crossing the outline, and coloured
    // like the backdrop: that is background, whatever its alpha says.
    if (!isMoat(p)) data[p * 4 + 3] = 0;

    const x = p % width;
    const y = (p / width) | 0;
    if (x > 0) seed(p - 1);
    if (x < width - 1) seed(p + 1);
    if (y > 0) seed(p - width);
    if (y < height - 1) seed(p + width);
  }
}

/**
 * Keeps only the largest connected opaque region, zeroing the alpha of
 * everything else. This clears the stray white islands the matting model leaves
 * in a corner — the "background didn't fully trim" artifact — while leaving the
 * creature itself untouched.
 *
 * Mutates `data` (RGBA) in place. 4-connectivity, iterative flood fill so a
 * large sprite can't blow the call stack.
 */
function removeStrayIslands(data: Buffer, width: number, height: number): void {
  const count = width * height;
  const alphaAt = (i: number) => data[i * 4 + 3];

  const labels = new Int32Array(count).fill(-1);
  const stack: number[] = [];
  let bestLabel = -1;
  let bestSize = 0;
  let nextLabel = 0;

  for (let start = 0; start < count; start++) {
    if (labels[start] !== -1 || alphaAt(start) <= OPAQUE_THRESHOLD) continue;

    const label = nextLabel++;
    let size = 0;
    stack.push(start);
    labels[start] = label;

    while (stack.length > 0) {
      const p = stack.pop()!;
      size++;
      const x = p % width;
      const y = (p / width) | 0;

      const neighbours = [
        x > 0 ? p - 1 : -1,
        x < width - 1 ? p + 1 : -1,
        y > 0 ? p - width : -1,
        y < height - 1 ? p + width : -1,
      ];
      for (const n of neighbours) {
        if (n >= 0 && labels[n] === -1 && alphaAt(n) > OPAQUE_THRESHOLD) {
          labels[n] = label;
          stack.push(n);
        }
      }
    }

    if (size > bestSize) {
      bestSize = size;
      bestLabel = label;
    }
  }

  if (bestLabel === -1) return; // fully transparent input — nothing to keep

  for (let p = 0; p < count; p++) {
    if (labels[p] !== bestLabel) data[p * 4 + 3] = 0;
  }
}

/**
 * Tier 4 Fallback: Crop center of photo to 192x192 PNG buffer
 */
export async function cropPhoto(photoBase64: string): Promise<Buffer> {
  const cleanB64 = photoBase64.replace(/^data:image\/\w+;base64,/, "");
  const inputBuffer = Buffer.from(cleanB64, "base64");
  
  return sharp(inputBuffer)
    .resize(SPRITE_SIZE, SPRITE_SIZE, { fit: "cover" })
    .png()
    .toBuffer();
}
