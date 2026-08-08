/**
 * The sink every image fuzz run uses.
 *
 * Exists so the CI suite, the studio page, the baseline and the live runner
 * all deliver input to the gate the same way — and specifically, the way the
 * ROUTE does.
 *
 * That distinction was a real gap. `req.body.imageBase64` is always a string,
 * so production always takes `validateUploadedImage`'s string branch: strip
 * the data-URL prefix, check base64 well-formedness, then decode. The fuzzer
 * handed raw Buffers straight in, which takes the other branch and skips the
 * base64 rule entirely — so the harness was exercising a path production never
 * uses, and `not_base64` was unreachable from a fuzz run.
 *
 * Delivery mode is declared by the mutant, never inferred from its name:
 *
 *   base64   encode and send as a data URL — the honest default, and what a
 *            real client does with whatever bytes it holds.
 *   literal  send the bytes as UTF-8 text, unencoded — prose arriving in a
 *            field that should hold base64. The attacker case, and the only
 *            way to reach the not_base64 rule.
 */
import {
  validateUploadedImage,
  type IngestAudience,
} from '../ingest/imageIngest';
import type { FuzzSink } from './runner';

export function makeImageSink(audience: IngestAudience = 'photo'): FuzzSink {
  return async (bytes, _mutation, deliverAs) => {
    const input =
      deliverAs === 'literal'
        ? bytes.toString('utf8')
        : `data:image/jpeg;base64,${bytes.toString('base64')}`;

    const result = await validateUploadedImage(input, audience);
    return {
      accepted: result.ok,
      detail: result.ok
        ? `accepted ${result.format} ${result.width}x${result.height}`
        : `rejected: ${result.reason}`,
    };
  };
}
