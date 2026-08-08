/**
 * Image mutation strategies for the ingest fuzzer.
 *
 * Ported from the Python harness (sprout_image_fuzzer.py). Two things changed
 * in the move, both deliberate:
 *
 *  - Randomness is injected, never ambient. Every function takes an `rng`, so
 *    a CI run with a fixed seed reproduces byte-for-byte from the seed printed
 *    in the log. `Math.random()` would make a failure unreproducible, which is
 *    the one thing a fuzz finding must not be.
 *  - Mutators return `null` rather than throwing when a seed cannot support
 *    them (a file too small to truncate, say). A thrown mutation is not a
 *    finding, and letting it look like one would poison the signal the runner
 *    exists to produce.
 */
import sharp from 'sharp';

/** Deterministic PRNG (mulberry32). Small, seedable, and good enough — this
 *  picks mutation strategies, it does not generate keys. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[randomInt(rng, 0, items.length - 1)];
}

/**
 * What the validator should do with this particular mutant.
 *
 * Carried per-application rather than per-mutation, because the honest answer
 * usually depends on what the mutation actually produced. `format_confusion`
 * re-encoding to WebP must be ACCEPTED (WebP is on the allow-list) while the
 * same mutation choosing TIFF must be rejected — the strategy is one thing,
 * its output another.
 *
 *   'accept' — a real, in-spec image. Refusing it is a false positive: a guard
 *              so strict it turns players away.
 *   'reject' — definitively malformed or out of policy. Accepting it means
 *              paying Plant.id to look at garbage.
 *   'either' — genuinely ambiguous, so only a crash or a hang is a finding.
 *              A single flipped bit deep in JPEG pixel data yields a valid
 *              image; the same flip in the header does not. Asserting either
 *              way would be asserting a coin toss.
 */
export type MutantExpectation = 'accept' | 'reject' | 'either';

export interface Mutant {
  bytes: Buffer;
  expect: MutantExpectation;
  /**
   * How the sink should hand this to the target.
   *
   *   'base64'  encode the bytes and send the string, which is what the real
   *             route receives: req.body.imageBase64 is always a string.
   *   'literal' send the bytes decoded as UTF-8 text, unencoded — the attacker
   *             case, where raw prose arrives in a field that should hold
   *             base64. This is the ONLY way to exercise the not_base64 rule.
   *
   * Defaults to 'base64' because that is the honest default: a fuzzer that
   * hands Buffers straight in tests a branch production never takes.
   */
  deliverAs?: 'base64' | 'literal';
}

export interface Mutation {
  name: string;
  /** Returns the mutant, or null when this seed cannot support the mutation. */
  apply(seed: Buffer, rng: () => number): Promise<Mutant | null>;
}

/**
 * Classic byte-level fuzzing: flip bits anywhere in the file.
 *
 * Expectation is 'either', and that is not a cop-out. A flip inside the JPEG
 * entropy-coded data yields a perfectly valid image with one pixel slightly
 * off — accepting it is right. The same flip inside the header destroys the
 * file — rejecting it is right. Which one happened depends on where the RNG
 * landed, so demanding a fixed verdict would be asserting a coin toss. What
 * this strategy is really hunting is a crash or a hang, and those are still
 * findings under 'either'.
 */
const bitflip: Mutation = {
  name: 'bitflip',
  async apply(seed, rng) {
    if (seed.byteLength === 0) return null;
    const out = Buffer.from(seed);
    const flips = randomInt(rng, 1, Math.max(1, Math.floor(out.byteLength / 500)));
    for (let i = 0; i < flips; i += 1) {
      const index = randomInt(rng, 0, out.byteLength - 1);
      out[index] ^= 1 << randomInt(rng, 0, 7);
    }
    return { bytes: out, expect: 'either' };
  },
};

/** A bad upload: the connection died partway through. Always refusable — the
 *  pixel data provably stops early — which is exactly what the validator's
 *  second stage exists to catch. */
const truncate: Mutation = {
  name: 'truncate',
  async apply(seed, rng) {
    if (seed.byteLength < 32) return null;
    const cut = randomInt(
      rng,
      Math.floor(seed.byteLength / 10),
      seed.byteLength - 1
    );
    return { bytes: seed.subarray(0, cut), expect: 'reject' };
  },
};

/** Scramble the header, leave the pixel data intact — does anything downstream
 *  trust the magic bytes it was handed? With the first 32 bytes randomised
 *  there is no recoverable format marker, so this must always be refused. */
const headerCorrupt: Mutation = {
  name: 'header_corrupt',
  async apply(seed, rng) {
    if (seed.byteLength < 32) return null;
    const out = Buffer.from(seed);
    for (let i = 0; i < Math.min(32, out.byteLength); i += 1) {
      out[i] = randomInt(rng, 0, 255);
    }
    return { bytes: out, expect: 'reject' };
  },
};

/**
 * Real image bytes of one format, presented as another.
 *
 * The expectation follows the target: PNG and WebP are on the allow-list and
 * must be ACCEPTED — content-sniffing is the whole point, so a real WebP is a
 * real image whatever the caller called it. GIF and TIFF decode perfectly well
 * and must still be refused, because sending them to Plant.id spends a paid
 * call to be told no.
 */
const formatConfusion: Mutation = {
  name: 'format_confusion',
  async apply(seed, rng) {
    const target = pick(rng, ['png', 'webp', 'gif', 'tiff'] as const);
    try {
      const pipeline = sharp(seed);
      const bytes =
        target === 'png'
          ? await pipeline.png().toBuffer()
          : target === 'webp'
            ? await pipeline.webp().toBuffer()
            : target === 'gif'
              ? await pipeline.gif().toBuffer()
              : await pipeline.tiff().toBuffer();
      const allowed = target === 'png' || target === 'webp';
      return { bytes, expect: allowed ? 'accept' : 'reject' };
    } catch {
      return null;
    }
  },
};

/** 1x1, absurdly large, or a sliver — the shapes that make a naive decoder
 *  allocate, divide by zero, or produce a degenerate resize. */
const extremeResize: Mutation = {
  name: 'extreme_resize',
  async apply(seed, rng) {
    const shape = pick(rng, ['tiny', 'huge', 'sliver', 'tall'] as const);
    const dims =
      shape === 'tiny'
        ? { width: 1, height: 1 }
        : shape === 'huge'
          ? { width: 9000, height: 9000 }
          : shape === 'sliver'
            ? { width: 4000, height: 4 }
            : { width: 4, height: 4000 };
    try {
      const bytes = await sharp(seed)
        .resize(dims.width, dims.height, { fit: 'fill' })
        .png()
        .toBuffer();
      // Every shape here is out of policy: 1x1 and the two slivers fall under
      // the 16px minimum edge, and 9000x9000 is 81 MP against a 40 MP ceiling.
      return { bytes, expect: 'reject' };
    } catch {
      return null;
    }
  },
};

/** Content the pipeline cannot possibly identify: noise, or a flat field.
 *  These decode perfectly — they are the silent_bad_output probes, not crash
 *  probes, and in CI they should be ACCEPTED by the validator. */
const pixelNoise: Mutation = {
  name: 'pixel_noise',
  async apply(seed, rng) {
    const kind = pick(rng, ['noise', 'black', 'white'] as const);
    try {
      const { width = 256, height = 256 } = await sharp(seed).metadata();
      const pixels = Buffer.alloc(width * height * 3);
      if (kind === 'noise') {
        for (let i = 0; i < pixels.length; i += 1) {
          pixels[i] = randomInt(rng, 0, 255);
        }
      } else {
        pixels.fill(kind === 'white' ? 255 : 0);
      }
      const bytes = await sharp(pixels, { raw: { width, height, channels: 3 } })
        .jpeg()
        .toBuffer();
      /* A real JPEG at the seed's own dimensions. Unidentifiable as a plant,
         but that is Plant.id's judgement to make, not the ingest gate's —
         refusing it here would mean refusing any photo of a blank wall. This
         is the case that catches a guard which has drifted into over-strict. */
      return { bytes, expect: 'accept' };
    } catch {
      return null;
    }
  },
};

/** Drop EXIF, or write a nonsensical orientation. Orientation drives rotation
 *  in most decoders, so an out-of-range tag is a cheap way to find one that
 *  indexes an array with it. */
const exifAbuse: Mutation = {
  name: 'exif_abuse',
  async apply(seed, rng) {
    try {
      const pipeline = sharp(seed);
      /*
        Orientations 5-8 are the mirrored and 90-degree cases — valid EXIF, and
        the ones a naive decoder mishandles, because they swap width and
        height. An earlier version wrote an OUT-OF-RANGE value here (9-255) to
        be nastier; sharp refuses to encode that, so the mutation threw and
        every second exif_abuse run was recorded as skipped. Fifteen wasted
        iterations that looked like coverage.
      */
      const bytes =
        rng() < 0.5
          ? await pipeline.jpeg().toBuffer() // sharp drops EXIF by default
          : await pipeline
              .withMetadata({ orientation: randomInt(rng, 5, 8) })
              .jpeg()
              .toBuffer();
      /* Still a valid JPEG of a real plant. A nonsensical orientation tag is
         something to ignore, not to refuse — a phone with a quirky sensor must
         not be locked out of the game. */
      return { bytes, expect: 'accept' };
    } catch {
      return null;
    }
  },
};

/** Not an image at all — the payloads that reach an upload endpoint in the
 *  wild. All must be refused, and none may crash the validator. */
const notAnImage: Mutation = {
  name: 'not_an_image',
  async apply(_seed, rng) {
    const payload = pick(rng, [
      '',
      '   ',
      'hello world!!',
      '<script>alert(1)</script>',
      '{"json":"not an image"}',
      '%PDF-1.4 fake pdf',
      '    ',
      'data:image/jpeg;base64,',
      '../../etc/passwd',
      'a'.repeat(10_000),
    ] as const);
    // Literal: this is prose arriving in a base64 field, not an encoding of it.
    return { bytes: Buffer.from(payload, 'utf8'), expect: 'reject', deliverAs: 'literal' };
  },
};


/* ==========================================================================
   Random-testing baseline
   --------------------------------------------------------------------------
   These are NOT mutation strategies. They ignore the seed entirely and
   generate from nothing, which is the point: they measure the claim that
   modern input validation rejects random input before it reaches anything
   interesting, and therefore that mutation-based fuzzing is a necessity
   rather than a preference.

   Kept out of MUTATIONS so a normal run is not diluted by inputs that are
   uninteresting once the claim has been measured. BASELINE_MUTATIONS below is
   what the baseline run uses.
   ========================================================================== */

/** Uniform random bytes, 0 to ~64 kB. The naive fuzzer from the textbook. */
const randomBytes: Mutation = {
  name: 'random_bytes',
  async apply(_seed, rng) {
    const length = randomInt(rng, 0, 65_536);
    const out = Buffer.allocUnsafe(length);
    for (let i = 0; i < length; i += 1) out[i] = randomInt(rng, 0, 255);
    // A random byte string is not a JPEG. If one is ever accepted, that is a
    // genuine finding and not a fluke worth shrugging at.
    return { bytes: out, expect: 'reject' };
  },
};

/**
 * Random PRINTABLE text, which is the more interesting half of the baseline.
 *
 * Uniform bytes usually fail at the base64 check before anything looks at
 * image structure, so they only ever exercise one rule. Printable text is
 * well-formed enough to get past `not_base64` and die at `unreadable`
 * instead — which is how the funnel shows two gates doing separate jobs
 * rather than one gate doing everything.
 */
const randomPrintable: Mutation = {
  name: 'random_printable',
  async apply(_seed, rng) {
    /*
      Printable ASCII, INCLUDING characters outside the base64 alphabet.

      An earlier version drew only from the base64 alphabet, which made every
      payload accidentally well-formed base64 — it decoded to garbage and died
      at `unreadable`, so the run measured one rule 9,999 times and reported
      the base64 gate as if it barely existed. Spaces and punctuation are what
      make this strategy reach `not_base64`, which is the whole reason it is
      separate from random_bytes.
    */
    const alphabet =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' +
      " !\"#$%&'()*,-.:;<=>?@[]^_`{|}~";
    const length = randomInt(rng, 16, 32_768);
    let text = '';
    for (let i = 0; i < length; i += 1) {
      text += alphabet[randomInt(rng, 0, alphabet.length - 1)];
    }
    return { bytes: Buffer.from(text, 'utf8'), expect: 'reject', deliverAs: 'literal' };
  },
};

/** The baseline set. Deliberately separate from MUTATIONS. */
export const BASELINE_MUTATIONS: readonly Mutation[] = [
  randomBytes,
  randomPrintable,
];

/** Every mutation the runner may choose from. */
export const MUTATIONS: readonly Mutation[] = [
  bitflip,
  truncate,
  headerCorrupt,
  formatConfusion,
  extremeResize,
  pixelNoise,
  exifAbuse,
  notAnImage,
];

