/**
 * The gate in front of Plant.id.
 *
 * Until this existed, `/api/pipeline/run-stream` took `imageBase64` from a JSON
 * body, checked only that it was truthy, stripped the data-URL prefix with a
 * regex, and posted the string to Plant.id. Every decode, resize and format
 * decision happened in the BROWSER (ScanPage's canvas, capped at a 1024px
 * edge) — which is no protection at all, because the browser is the one part
 * of the path an attacker replaces by POSTing to the endpoint directly.
 *
 * So this is not a performance guard or a tidying-up. It is the first point on
 * the server that looks at the bytes at all.
 *
 * Design rules, in priority order:
 *
 *  1. REJECT ONLY WHAT IS DEFINITIVELY WRONG. This runs on every player scan.
 *     A false rejection is a player who cannot play, which is worse than
 *     forwarding a weird-but-decodable photo. Anything merely unusual — an
 *     odd aspect ratio, a huge file that is still within limits, unexpected
 *     EXIF — is allowed through.
 *  2. NEVER THROW. Callers get a discriminated result. A validator that can
 *     itself crash would hand the route a new 500 in exchange for the one it
 *     was meant to prevent, and would make the fuzzer's crash signal
 *     ambiguous.
 *  3. BOUND THE WORK. Metadata only — `sharp().metadata()` reads the header
 *     and does not decode pixels, so a decompression bomb is rejected on its
 *     declared dimensions rather than by being decoded first.
 *
 * This is also the function the fuzz harness targets
 * (pipeline/__tests__/imageIngest.fuzz.test.ts). The harness calls THIS, not a
 * copy, so a green fuzz run is a statement about the code players actually
 * hit.
 */
import sharp, { type Metadata } from 'sharp';

/** Formats Plant.id accepts and a phone camera realistically produces. The
 *  allow-list is deliberately short: an unlisted format reaching Plant.id
 *  spends a paid call to be told no. */
export const ALLOWED_IMAGE_FORMATS = ['jpeg', 'png', 'webp'] as const;
export type AllowedImageFormat = (typeof ALLOWED_IMAGE_FORMATS)[number];

/**
 * Ceiling on decoded pixels — the decompression-bomb guard.
 *
 * 40 MP is far above anything the client sends (it caps the long edge at
 * 1024px, so ~1 MP) and still above a full-frame phone original a future
 * mobile client might upload unresized, while refusing the 6000x6000 and
 * 4000x4 shapes a crafted file uses to make a decoder allocate.
 */
export const MAX_IMAGE_PIXELS = 40_000_000;

/** Smallest image worth spending a Plant.id call on. A 1x1 is not a plant. */
export const MIN_IMAGE_EDGE = 16;

/**
 * Ceiling on decoded bytes, independent of the 20 MB JSON body limit.
 *
 * base64 inflates by 4/3, so the router's 20 MB body already implies ~15 MB of
 * image. This states the real intent rather than leaving it as an accident of
 * the transport encoding.
 */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export type IngestRejection =
  | 'missing'
  | 'not_base64'
  | 'too_large'
  | 'too_small'
  | 'unreadable'
  | 'truncated'
  | 'unsupported_format'
  | 'too_many_pixels';

export interface IngestSuccess {
  ok: true;
  /** The base64 payload with any data-URL prefix removed — what Plant.id wants. */
  base64: string;
  bytes: number;
  format: AllowedImageFormat;
  width: number;
  height: number;
}

export interface IngestFailure {
  ok: false;
  reason: IngestRejection;
  /** One sentence, safe to show a player. Never contains decoder output: a
   *  parser's error text is attacker-influenced and belongs in the log. */
  message: string;
}

export type IngestResult = IngestSuccess | IngestFailure;

const MESSAGES: Record<IngestRejection, string> = {
  missing: 'No image provided.',
  not_base64: 'That image could not be read. Try taking the photo again.',
  too_large: 'That image is too large. Try taking the photo again.',
  too_small: 'That image is too small to identify. Move closer and retry.',
  unreadable: 'That image could not be read. Try taking the photo again.',
  // Same words as `unreadable` on purpose — "your upload was cut short" is not
  // something a player can act on differently. The reasons stay distinct
  // because the fuzz report and the logs benefit from telling them apart.
  truncated: 'That image could not be read. Try taking the photo again.',
  unsupported_format: 'That image format is not supported. Use JPEG, PNG or WebP.',
  too_many_pixels: 'That image is too large. Try taking the photo again.',
};

function fail(reason: IngestRejection): IngestFailure {
  return { ok: false, reason, message: MESSAGES[reason] };
}

/**
 * Strips an optional `data:image/...;base64,` prefix.
 *
 * The original regex in identify.ts was `/^data:image\/\w+;base64,/`. That is
 * kept compatible here, but note it is intentionally NOT the validation step —
 * a string that fails to match simply keeps all of its characters and is
 * judged on whether it decodes.
 */
function stripDataUrlPrefix(value: string): string {
  return value.replace(/^data:image\/[\w.+-]+;base64,/, '');
}

/**
 * True when `value` is well-formed base64.
 *
 * `Buffer.from(x, 'base64')` never throws — it silently skips anything outside
 * the alphabet, so "hello world!!" decodes to a short meaningless buffer
 * instead of failing. That silent tolerance is exactly how garbage reached
 * Plant.id, so the string is checked before it is trusted.
 */
function isWellFormedBase64(value: string): boolean {
  if (value.length === 0) return false;
  // Reject embedded whitespace/newlines rather than stripping them: a real
  // client's data URL has none, and accepting them widens what "the same
  // image" can look like on the wire.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  // Base64 encodes 3 bytes per 4 characters; a length of 4n+1 is impossible.
  if (value.length % 4 === 1) return false;
  return true;
}

/**
 * Validate an inbound photo.
 *
 * Accepts the raw request field (with or without a data-URL prefix) or a
 * Buffer, so the fuzz harness can hand over mutated bytes without re-encoding
 * on every iteration.
 */
export async function validateUploadedImage(
  input: unknown
): Promise<IngestResult> {
  let buffer: Buffer;
  let base64: string;

  if (Buffer.isBuffer(input)) {
    buffer = input;
    if (buffer.byteLength === 0) return fail('missing');
    base64 = buffer.toString('base64');
  } else {
    if (typeof input !== 'string' || input.trim().length === 0) {
      return fail('missing');
    }
    const stripped = stripDataUrlPrefix(input.trim());
    if (!isWellFormedBase64(stripped)) return fail('not_base64');
    buffer = Buffer.from(stripped, 'base64');
    if (buffer.byteLength === 0) return fail('not_base64');
    base64 = stripped;
  }

  if (buffer.byteLength > MAX_IMAGE_BYTES) return fail('too_large');

  /*
    metadata() parses the header only — it does not decode pixels — so the
    pixel ceiling below is enforced on the DECLARED dimensions. That ordering
    is the point: a decompression bomb is refused on what it claims to be,
    before anything allocates a buffer that size.

    Wrapped because a malformed header makes sharp throw, and this function's
    contract is that it never does. The decoder's own message is logged rather
    than returned: it is derived from attacker-supplied bytes.
  */
  let metadata: Metadata;
  try {
    metadata = await sharp(buffer, { failOn: 'error' }).metadata();
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        '[ingest] rejected an image sharp could not parse:',
        error instanceof Error ? error.message : error
      );
    }
    return fail('unreadable');
  }

  const { format, width, height } = metadata;
  if (!format || typeof width !== 'number' || typeof height !== 'number') {
    return fail('unreadable');
  }
  if (!ALLOWED_IMAGE_FORMATS.includes(format as AllowedImageFormat)) {
    return fail('unsupported_format');
  }
  if (width < MIN_IMAGE_EDGE || height < MIN_IMAGE_EDGE) return fail('too_small');
  // Multiplied as declared. Both factors are already bounded by the byte cap
  // above, so this cannot overflow into a false pass.
  if (width * height > MAX_IMAGE_PIXELS) return fail('too_many_pixels');

  /*
    Stage two: integrity.

    The header gate above cannot see a truncated file — a JPEG cut in half
    still carries a perfectly good header, so metadata() happily reports
    "jpeg 1024x768" for a payload whose pixel data stops in the middle.
    Measured: metadata() 0.15ms, full decode 2.1ms on a 1024x768 upload. Two
    milliseconds against a pipeline that spends seconds in Plant.id, Gemini
    and Flux is worth paying to avoid sending a half-image to a paid API.

    Order is load-bearing. This decodes, so it runs ONLY after the pixel
    ceiling has been checked against the declared dimensions — otherwise this
    line would be the decompression bomb rather than the defence against it.
    `limitInputPixels` restates the same ceiling inside sharp as a backstop in
    case the two ever drift.
  */
  try {
    await sharp(buffer, {
      failOn: 'truncated',
      limitInputPixels: MAX_IMAGE_PIXELS,
    })
      .raw()
      .toBuffer();
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        '[ingest] rejected an image that failed to decode fully:',
        error instanceof Error ? error.message : error
      );
    }
    return fail('truncated');
  }

  return {
    ok: true,
    base64,
    bytes: buffer.byteLength,
    format: format as AllowedImageFormat,
    width,
    height,
  };
}
