/**
 * Does Flux obey a chroma-key backdrop as reliably as it obeys "pure-white"?
 *
 *   npm run backdrop:experiment -w server                    # refuses, exits 2
 *   npm run backdrop:experiment -w server -- --confirm-spend
 *
 * THIS SPENDS API CREDITS. One Flux render per prompt per backdrop.
 *
 * The question it answers. finishSprite must eventually tell "background" from
 * "creature", and today it cannot: white is distance 0 from SPROUT_PALETTE, so
 * leftover backdrop snaps to #FFFFFF and is bit-identical to a legitimately
 * white plant. Portulaca grandiflora came out a white creature on a white field
 * with ~7,500 px of background still baked in, and nothing downstream could
 * detect it. A backdrop far from the palette makes that detectable — but only
 * if the renderer actually paints it.
 *
 * Deliberately NOT a vitest file and not under pipeline/__tests__/. The studio's
 * Unit Tests page shells vitest over that glob, so anything matching it is one
 * click from spending money. Same rule as scripts/fuzz-pipeline-live.ts.
 *
 * Nothing here writes to Firestore, Storage, or any archive. It renders,
 * measures, and writes PNGs to a local output directory.
 */
import '../env';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { generateSprite } from '../pipeline/stages/generate';
import { serverEnv } from '../platform/env';

/** Candidate backdrops, with the distance-to-palette that motivated each. */
const BACKDROPS = [
  { id: 'white', phrase: 'pure-white', rgb: [255, 255, 255], paletteDistance: 0 },
  { id: 'magenta', phrase: 'pure magenta (#FF00FF)', rgb: [255, 0, 255], paletteDistance: 142 },
] as const;

/**
 * Species chosen for the failure this is about, not for variety.
 *
 * Portulaca is the reported case — a white creature, where a white backdrop is
 * indistinguishable from the subject. Leucophyllum and Achillea are also
 * white/pale flowering plants, so all three put maximum pressure on the
 * ambiguity. A green plant would pass under either backdrop and prove nothing.
 */
const SUBJECTS = [
  'Portulaca grandiflora, a low succulent with white ruffled flowers',
  'Leucophyllum frutescens, a silver-leaved shrub with pale blooms',
  'Achillea millefolium, feathery foliage with flat white flower heads',
] as const;

const OUT_DIR = path.join(__dirname, '..', 'backdrop-experiment-out');

function styleScaffold(subject: string, backdropPhrase: string): string {
  /* Mirrors promptCraft's own scaffold, with the backdrop phrase swapped. Kept
     in step with the real one by hand rather than imported, because the point
     is to vary exactly one clause and nothing else. */
  return (
    `A cute chibi creature inspired by ${subject}. ` +
    'Style: clean bold black outlines, flat cel-shaded colouring, retro 16-bit pixel art, ' +
    'grid-aligned pixels, even lighting, no shadows. ' +
    'One single creature, front-facing and centered, shown whole with a clear margin of ' +
    'empty space on every side so no part of it touches or is clipped by the frame edge, ' +
    `fully isolated on a solid flat ${backdropPhrase} background — no scenery, pot, ground, ` +
    'graph paper or grid backdrop, gradient, shadow, or reflection, so it cuts out cleanly.'
  );
}

interface Measurement {
  /** Share of border pixels that are the requested backdrop colour. */
  borderMatch: number;
  /** Share of the whole image within tolerance of the backdrop colour. */
  coverage: number;
  /** How far the actual corner colour sits from the one that was asked for. */
  cornerDistance: number;
  /** Backdrop-coloured pixels NOT reachable from the frame edge — bleed into
   *  the creature, which is the failure mode that would make this worse than
   *  white rather than better. */
  interiorBleed: number;
}

function distance(a: number[], b: number[]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

/** Tolerance for "is this pixel the backdrop". Generous, because a diffusion
 *  model will not emit a mathematically flat field and the keyer would not
 *  demand one either. */
const BACKDROP_TOLERANCE = 60;

async function measure(png: Buffer, target: readonly number[]): Promise<Measurement> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const at = (i: number) => [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
  const isBackdrop = (i: number) => distance(at(i), [...target]) <= BACKDROP_TOLERANCE;

  let borderTotal = 0;
  let borderHits = 0;
  const borderIdx: number[] = [];
  for (let x = 0; x < W; x++) {
    for (const i of [x, (H - 1) * W + x]) {
      borderTotal++;
      if (isBackdrop(i)) { borderHits++; borderIdx.push(i); }
    }
  }
  for (let y = 0; y < H; y++) {
    for (const i of [y * W, y * W + W - 1]) {
      borderTotal++;
      if (isBackdrop(i)) { borderHits++; borderIdx.push(i); }
    }
  }

  let coverage = 0;
  for (let i = 0; i < W * H; i++) if (isBackdrop(i)) coverage++;

  // Flood from the border through backdrop-coloured pixels; whatever matches
  // the backdrop but is unreachable is bleed inside the creature.
  const seen = new Uint8Array(W * H);
  const stack = [...borderIdx];
  let reachable = 0;
  while (stack.length) {
    const i = stack.pop()!;
    if (i < 0 || i >= W * H || seen[i]) continue;
    seen[i] = 1;
    if (!isBackdrop(i)) continue;
    reachable++;
    const x = i % W;
    const y = (i / W) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < W - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - W);
    if (y < H - 1) stack.push(i + W);
  }

  return {
    borderMatch: borderHits / borderTotal,
    coverage: coverage / (W * H),
    cornerDistance: distance(at(0), [...target]),
    interiorBleed: coverage - reachable,
  };
}

async function main(): Promise<void> {
  const confirmed = process.argv.includes('--confirm-spend');
  const renders = BACKDROPS.length * SUBJECTS.length;

  if (!confirmed) {
    console.log(
      [
        '',
        'Backdrop experiment — WOULD SPEND API CREDITS.',
        '',
        `  ${SUBJECTS.length} subjects x ${BACKDROPS.length} backdrops = ${renders} Flux renders`,
        `  backdrops: ${BACKDROPS.map((b) => b.id).join(', ')}`,
        '',
        '  Nothing is written to Firestore, Storage or any archive.',
        '',
        '  Re-run with --confirm-spend to actually render.',
        '',
      ].join('\n')
    );
    process.exit(2);
  }

  if (!serverEnv.fluxApiKey || serverEnv.fluxApiKey === 'MOCK_KEY') {
    console.error('No usable FLUX_API_KEY / NVIDIA_API_KEY. Refusing to run a mock and call it evidence.');
    process.exit(2);
  }

  await mkdir(OUT_DIR, { recursive: true });
  const rows: string[] = [];

  for (const subject of SUBJECTS) {
    for (const backdrop of BACKDROPS) {
      const label = `${subject.split(',')[0].replace(/\s+/g, '_')}__${backdrop.id}`;
      process.stdout.write(`rendering ${label} ... `);
      try {
        const result = await generateSprite(styleScaffold(subject, backdrop.phrase), {
          flux: serverEnv.fluxApiKey,
          gemini: null,
          geminiModel: '',
          provider: 'flux',
        });

        if (!result.fromModel) {
          console.log('SKIPPED (placeholder, no model ran)');
          rows.push(`${label.padEnd(48)} placeholder — no evidence`);
          continue;
        }

        await writeFile(path.join(OUT_DIR, `${label}.png`), result.png);
        const m = await measure(result.png, backdrop.rgb);
        console.log('ok');
        rows.push(
          `${label.padEnd(48)} border=${(m.borderMatch * 100).toFixed(1)}%  ` +
            `coverage=${(m.coverage * 100).toFixed(1)}%  ` +
            `cornerOff=${m.cornerDistance.toFixed(0)}  bleed=${m.interiorBleed}`
        );
      } catch (error) {
        console.log('FAILED');
        rows.push(`${label.padEnd(48)} FAILED: ${(error as Error).message.slice(0, 80)}`);
      }
    }
  }

  console.log('\n=== compliance ===');
  console.log('border   = share of frame-edge pixels that ARE the requested colour (want ~100%)');
  console.log('coverage = share of the whole image matching it');
  console.log('cornerOff= distance from the requested colour at the top-left (want ~0)');
  console.log('bleed    = backdrop-coloured pixels INSIDE the creature (want 0)\n');
  for (const row of rows) console.log('  ' + row);
  console.log(`\nPNGs: ${OUT_DIR}`);
  console.log(`Palette distance — white ${BACKDROPS[0].paletteDistance}, magenta ${BACKDROPS[1].paletteDistance}.`);
}

void main();
