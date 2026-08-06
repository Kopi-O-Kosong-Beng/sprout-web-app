import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  validateUploadedImage,
  MAX_IMAGE_PIXELS,
  MIN_IMAGE_EDGE,
  MAX_IMAGE_BYTES,
} from '../ingest/imageIngest';

/** A real encoded image of the given size and format. Generated rather than
 *  committed: these assert decoder behaviour, and a fixture file would only
 *  make the expected dimensions harder to read. */
async function image(
  width: number,
  height: number,
  format: 'jpeg' | 'png' | 'webp' | 'gif' | 'tiff' = 'jpeg'
): Promise<Buffer> {
  const base = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 40, g: 90, b: 50 },
    },
  });
  return format === 'jpeg'
    ? base.jpeg().toBuffer()
    : format === 'png'
      ? base.png().toBuffer()
      : format === 'webp'
        ? base.webp().toBuffer()
        : format === 'gif'
          ? base.gif().toBuffer()
          : base.tiff().toBuffer();
}

function dataUrl(buffer: Buffer, mime = 'image/jpeg'): string {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

describe('validateUploadedImage', () => {
  it('accepts a normal camera photo and reports what it is', async () => {
    const result = await validateUploadedImage(dataUrl(await image(1024, 768)));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe('jpeg');
    expect(result.width).toBe(1024);
    expect(result.height).toBe(768);
    // The data-URL prefix is gone: this is what Plant.id is handed.
    expect(result.base64.startsWith('data:')).toBe(false);
  });

  it('accepts bare base64 with no data-URL prefix', async () => {
    const result = await validateUploadedImage(
      (await image(256, 256)).toString('base64')
    );
    expect(result.ok).toBe(true);
  });

  it.each(['png', 'webp'] as const)('accepts %s', async (format) => {
    const result = await validateUploadedImage(await image(256, 256, format));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.format).toBe(format);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an empty string', ''],
    ['whitespace', '   '],
    ['a number', 42],
    ['an object', { nope: true }],
  ])('rejects %s as missing', async (_label, input) => {
    const result = await validateUploadedImage(input);
    expect(result).toMatchObject({ ok: false, reason: 'missing' });
  });

  /*
   * The silent-tolerance bug this closes: Buffer.from(x, 'base64') never
   * throws. It skips anything outside the alphabet, so "hello world!!" decodes
   * to a short meaningless buffer and was forwarded to Plant.id as an image.
   */
  it.each([
    ['prose', 'hello world!! this is not an image'],
    ['a script tag', '<script>alert(1)</script>'],
    ['base64 with inner whitespace', 'iVBORw0KGgo AAAANSUhEUg'],
    ['an impossible length (4n+1)', 'QUJDRA=='.slice(0, 5)],
  ])('rejects %s as not base64', async (_label, input) => {
    const result = await validateUploadedImage(input);
    expect(result).toMatchObject({ ok: false, reason: 'not_base64' });
  });

  it('rejects well-formed base64 that is not an image', async () => {
    const notAnImage = Buffer.from('a'.repeat(4096)).toString('base64');
    const result = await validateUploadedImage(notAnImage);
    expect(result).toMatchObject({ ok: false, reason: 'unreadable' });
  });

  /*
   * Truncation is the one case the header gate cannot see: a JPEG cut in half
   * still carries a valid header, so metadata() reports "jpeg 1024x768" for a
   * file whose pixel data stops midway. Catching it is the whole reason the
   * validator decodes as well as reading the header.
   */
  it('rejects a truncated image the header alone would have accepted', async () => {
    const whole = await image(1024, 768);
    const half = whole.subarray(0, Math.floor(whole.byteLength / 2));

    // The header still parses — this is what made the second stage necessary.
    const header = await sharp(half).metadata();
    expect(header.format).toBe('jpeg');
    expect(header.width).toBe(1024);

    const result = await validateUploadedImage(half);
    expect(result).toMatchObject({ ok: false, reason: 'truncated' });
  });

  it('rejects a format outside the allow-list even though it decodes', async () => {
    // A real, valid TIFF: the point is that the allow-list is what refuses it,
    // not the decoder. Sending this to Plant.id would spend a call to be told no.
    const result = await validateUploadedImage(await image(64, 64, 'tiff'));
    expect(result).toMatchObject({ ok: false, reason: 'unsupported_format' });
  });

  it('rejects an image below the minimum edge', async () => {
    const result = await validateUploadedImage(await image(1, 1, 'png'));
    expect(result).toMatchObject({ ok: false, reason: 'too_small' });
  });

  it('accepts an image sitting exactly on the minimum edge', async () => {
    const result = await validateUploadedImage(
      await image(MIN_IMAGE_EDGE, MIN_IMAGE_EDGE, 'png')
    );
    expect(result.ok).toBe(true);
  });

  /*
   * The decompression bomb. This is refused on its DECLARED dimensions, read
   * from the header — sharp().metadata() does not decode pixels — so nothing
   * ever allocates the full frame. A validator that had to decode first would
   * be the very denial-of-service it is meant to prevent.
   */
  it('rejects a pixel bomb on its header without decoding it', async () => {
    // 8000x6000 = 48 MP declared, over our 40 MP ceiling, but a solid colour
    // so the encoded file stays well inside the byte cap — exactly the shape a
    // crafted upload uses. (Sized under sharp's own ~268 MP creation limit,
    // which refuses to BUILD a larger fixture.)
    const bomb = await sharp({
      create: {
        width: 8_000,
        height: 6_000,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();

    expect(bomb.byteLength).toBeLessThan(MAX_IMAGE_BYTES);
    expect(8_000 * 6_000).toBeGreaterThan(MAX_IMAGE_PIXELS);

    const started = Date.now();
    const result = await validateUploadedImage(bomb);
    expect(result).toMatchObject({ ok: false, reason: 'too_many_pixels' });
    // Header-only work. Generous bound — the assertion is "did not decode 625
    // megapixels", not a benchmark.
    expect(Date.now() - started).toBeLessThan(5_000);
  }, 30_000);

  it('rejects a payload over the byte cap', async () => {
    const tooBig = Buffer.alloc(MAX_IMAGE_BYTES + 1, 0x41);
    const result = await validateUploadedImage(tooBig);
    expect(result).toMatchObject({ ok: false, reason: 'too_large' });
  });

  it('never leaks decoder output into the player-facing message', async () => {
    const result = await validateUploadedImage(
      Buffer.from('a'.repeat(4096)).toString('base64')
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Decoder text is derived from attacker-supplied bytes; it belongs in the
    // log, not in a response.
    expect(result.message).not.toMatch(/vips|sharp|Error:|\bat\b\s+\w+\./i);
    expect(result.message.length).toBeLessThan(120);
  });
});
