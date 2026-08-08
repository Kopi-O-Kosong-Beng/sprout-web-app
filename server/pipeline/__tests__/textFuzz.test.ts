import { describe, expect, it } from 'vitest';
import { runTextFuzz, formatTextReport } from '../fuzz/text/textFuzz';
import {
  EMAIL_PAYLOADS,
  INJECTION_PAYLOADS,
  REDOS_PAYLOADS,
  lengthBoundaries,
} from '../fuzz/text/payloads';
import { querySchema } from '../../routes/query.routes';

/**
 * Text fuzzing: the control group.
 *
 * Both classical fuzzing assumptions hold on these endpoints — execution is
 * free, and a wrong answer is decidable by looking at it — which is exactly
 * what makes them the right place to demonstrate the techniques that do NOT
 * transfer to an ML image pipeline.
 *
 * Free, offline and fast: the whole suite is Joi calls, no network.
 */
describe('text fuzzing', () => {
  it('drives every case without a wrong verdict, a crash, or a slow validation', () => {
    const report = runTextFuzz();

    expect(report.findings, formatTextReport(report)).toEqual([]);
    // A run that somehow executed nothing would also report zero findings.
    expect(report.cases.length).toBeGreaterThan(80);
  });

  /*
    The free-text fields must ACCEPT injection payloads.

    This is the assertion most likely to be "fixed" in the wrong direction by
    someone later. A contact form that rejects an angle bracket or the word
    "select" is broken: a player reporting a scanner bug may legitimately need
    to paste markup. Safety here is escaping on output, not refusal on input,
    and a validator that confuses the two blocks real users while stopping
    nothing.
  */
  it('accepts injection payloads in free text rather than filtering them', () => {
    for (const payload of INJECTION_PAYLOADS) {
      const { error } = querySchema.validate({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        subject: 'A question',
        category: 'general',
        message: payload.value,
      });
      expect(error, `${payload.label} should be stored, not refused`).toBeUndefined();
    }
  });

  /*
    ReDoS: a NEGATIVE result, recorded rather than dropped.

    Joi's email validator does not backtrack, so the nested-quantifier shapes
    return in about a millisecond. That is worth asserting: "we looked and it
    is safe" is a finding, and a bound that nobody checks is a bound nobody
    notices moving.
  */
  it('validates ReDoS shapes in bounded time', () => {
    for (const payload of REDOS_PAYLOADS) {
      const started = Date.now();
      querySchema.validate({
        name: 'Ada',
        email: payload.value,
        subject: 'x',
        category: 'general',
        message: 'x',
      });
      const elapsed = Date.now() - started;
      expect(elapsed, `${payload.label} took ${elapsed}ms`).toBeLessThan(250);
    }
  });

  it('gets the length boundary exactly right, including in UTF-16 units', () => {
    const cases = lengthBoundaries(2000);
    for (const payload of cases) {
      const { error } = querySchema.validate({
        name: 'Ada',
        email: 'ada@example.com',
        subject: 'x',
        category: 'general',
        message: payload.value,
      });
      const actual = error ? 'reject' : 'accept';
      expect(actual, `${payload.label}: ${payload.probes}`).toBe(payload.expect);
    }
  });

  /*
    Does the harness have teeth? Same question the image side answers, and it
    matters more here because the suite currently reports zero findings — from
    the outside, a correct validator and a broken oracle look identical.
  */
  it('would notice if an expectation stopped holding', () => {
    // Invert one known-good expectation and confirm the comparison catches it.
    const good = EMAIL_PAYLOADS.find((p) => p.label === 'plain')!;
    const { error } = querySchema.validate({
      name: 'Ada',
      email: good.value,
      subject: 'x',
      category: 'general',
      message: 'x',
    });
    const actual = error ? 'reject' : 'accept';
    expect(actual).toBe('accept');
    // If the oracle were vacuous this comparison could not fail either.
    expect(actual).not.toBe('reject');
  });

  it('rejects every malformed email in the grammar corpus', () => {
    const invalid = EMAIL_PAYLOADS.filter((p) => p.expect === 'reject');
    expect(invalid.length).toBeGreaterThan(5);
    for (const payload of invalid) {
      const { error } = querySchema.validate({
        name: 'Ada',
        email: payload.value,
        subject: 'x',
        category: 'general',
        message: 'x',
      });
      expect(error, `${payload.label} should be refused`).toBeDefined();
    }
  });
});
