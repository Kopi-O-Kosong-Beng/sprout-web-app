/**
 * Ask the ingest gate what it makes of something, by hand.
 *
 *   npm run check:image -w server -- ./photo.jpg
 *   npm run check:image -w server -- 'hello world!!'
 *   npm run check:image -w server -- 'data:image/jpeg;base64,AAAA'
 *
 * Sits beside check:email and check:storage: a way to interrogate one piece of
 * the server without booting it. This calls the SAME validateUploadedImage
 * that /api/pipeline/run-stream calls on every scan and that the fuzzer
 * targets, so what it prints is what a player would get.
 *
 * Free and offline — no API key, no network, nothing billed.
 */
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import {
  validateUploadedImage,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_PIXELS,
  MIN_IMAGE_EDGE,
  ALLOWED_IMAGE_FORMATS,
} from '../pipeline/ingest/imageIngest';

async function main(): Promise<void> {
  const argument = process.argv[2];

  if (!argument) {
    console.error(
      [
        'Usage: npm run check:image -w server -- <file path | base64 | data URL | any string>',
        '',
        'Current policy:',
        `  formats     ${ALLOWED_IMAGE_FORMATS.join(', ')}`,
        `  min edge    ${MIN_IMAGE_EDGE}px`,
        `  max pixels  ${MAX_IMAGE_PIXELS.toLocaleString()}`,
        `  max bytes   ${MAX_IMAGE_BYTES.toLocaleString()}`,
      ].join('\n')
    );
    process.exit(2);
  }

  /*
    `npm run -w server` runs with cwd set to server/, so a path typed at the
    repo root ("client/src/.../hydrangea.jpg") would not resolve and would be
    silently treated as a base64 string — reporting not_base64 for a perfectly
    good photograph. npm sets INIT_CWD to where the command was actually
    invoked, so try that first and fall back to cwd.
  */
  const candidates = [
    path.resolve(process.env.INIT_CWD ?? process.cwd(), argument),
    path.resolve(process.cwd(), argument),
  ];
  const filePath = candidates.find((candidate) => existsSync(candidate));

  // A path if one resolves, otherwise the literal string — so pasting junk
  // straight from a request body works without quoting rules.
  const input = filePath ? await readFile(filePath) : argument;
  const source = Buffer.isBuffer(input)
    ? `file ${filePath} (${input.byteLength} bytes)`
    : `string of ${argument.length} chars`;

  const result = await validateUploadedImage(input);

  console.log(`input:  ${source}`);
  if (result.ok) {
    console.log(
      `result: ACCEPTED — ${result.format} ${result.width}x${result.height}, ${result.bytes} bytes`
    );
    console.log('        this would be sent on to Plant.id.');
  } else {
    console.log(`result: REJECTED — ${result.reason}`);
    console.log(`player sees: "${result.message}"`);
    console.log('        the pipeline stops here; no paid API call is made.');
  }
  // Exit code mirrors the verdict, so this composes in a shell loop.
  process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(2);
});
