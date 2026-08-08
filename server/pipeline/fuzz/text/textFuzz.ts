/**
 * The text-fuzzing harness.
 *
 * Drives the REAL Joi schemas from `routes/query.routes.ts` — the same objects
 * the routes validate against, not a copy. A harness fuzzing a
 * reimplementation would prove nothing about what the endpoints accept.
 *
 * Why this exists alongside the image harness: it is the control group. Both
 * classical fuzzing assumptions hold here — execution is free, and a wrong
 * answer is decidable by looking at it — so the techniques that do not
 * transfer to an ML image pipeline can be shown working properly on something
 * that suits them.
 *
 * Free, offline, deterministic. Nothing here touches a network or a provider.
 */
import type Joi from 'joi';
import { querySchema, statusSchema } from '../../../routes/query.routes';
import {
  EMAIL_PAYLOADS,
  INJECTION_PAYLOADS,
  NORMALISATION_PAYLOADS,
  REDOS_PAYLOADS,
  REF_NUMBER_PAYLOADS,
  lengthBoundaries,
  type TextPayload,
} from './payloads';

export type TextOutcome = 'ok' | 'wrong_verdict' | 'slow' | 'crash';

export interface TextCase {
  suite: string;
  field: string;
  label: string;
  outcome: TextOutcome;
  expected: 'accept' | 'reject';
  actual: 'accept' | 'reject' | 'threw';
  probes: string;
  elapsedMs: number;
  detail: string;
}

export interface TextFuzzReport {
  cases: TextCase[];
  counts: Record<TextOutcome, number>;
  findings: TextCase[];
  /** Slowest validation observed, in ms. The ReDoS guard is a time bound, and
   *  a bound nobody reports is a bound nobody notices moving. */
  slowestMs: number;
}

/**
 * A validator is "slow" past this. Joi's email check measures around 1ms on
 * the ReDoS shapes, so 250ms is three orders of magnitude of headroom: it will
 * not flap, and it will still catch a genuine catastrophic backtrack.
 */
const SLOW_MS = 250;

/** A minimal valid contact submission. Each case overrides one field, so a
 *  rejection is attributable to the field under test rather than to a
 *  neighbour that happened to be invalid too. */
function baseQuery(): Record<string, unknown> {
  return {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    organisation: 'Analytical Engines',
    subject: 'A question about scanning',
    category: 'general',
    message: 'My fern would not scan this morning.',
  };
}

function baseStatus(): Record<string, unknown> {
  return { refNumber: 'SPR-20260712-0001', email: 'ada@example.com' };
}

function runOne(
  suite: string,
  field: string,
  payload: TextPayload,
  schema: Joi.ObjectSchema,
  body: Record<string, unknown>
): TextCase {
  const startedAt = Date.now();
  let actual: TextCase['actual'];
  let detail = '';

  try {
    const { error } = schema.validate(body, { abortEarly: true });
    actual = error ? 'reject' : 'accept';
    detail = error?.message ?? 'accepted';
  } catch (error) {
    // A validator is not allowed to throw. Joi returns errors; an exception
    // means something upstream of the rules went wrong.
    actual = 'threw';
    detail = error instanceof Error ? error.message : String(error);
  }

  const elapsedMs = Date.now() - startedAt;

  const outcome: TextOutcome =
    actual === 'threw'
      ? 'crash'
      : elapsedMs > SLOW_MS
        ? 'slow'
        : actual === payload.expect
          ? 'ok'
          : 'wrong_verdict';

  return {
    suite,
    field,
    label: payload.label,
    outcome,
    expected: payload.expect,
    actual,
    probes: payload.probes,
    elapsedMs,
    detail: detail.slice(0, 200),
  };
}

export function runTextFuzz(): TextFuzzReport {
  const cases: TextCase[] = [];

  const push = (
    suite: string,
    field: string,
    payloads: TextPayload[],
    build: (value: string) => Record<string, unknown>,
    schema: Joi.ObjectSchema
  ) => {
    for (const payload of payloads) {
      cases.push(runOne(suite, field, payload, schema, build(payload.value)));
    }
  };

  // --- Contact form -------------------------------------------------------

  push('injection', 'message', INJECTION_PAYLOADS, (message) => ({ ...baseQuery(), message }), querySchema);
  push('injection', 'name', INJECTION_PAYLOADS, (name) => ({ ...baseQuery(), name }), querySchema);
  push('injection', 'subject', INJECTION_PAYLOADS, (subject) => ({ ...baseQuery(), subject }), querySchema);

  push('normalisation', 'message', NORMALISATION_PAYLOADS, (message) => ({ ...baseQuery(), message }), querySchema);
  push('normalisation', 'name', NORMALISATION_PAYLOADS, (name) => ({ ...baseQuery(), name }), querySchema);

  push('email grammar', 'email', EMAIL_PAYLOADS, (email) => ({ ...baseQuery(), email }), querySchema);

  push('boundary', 'message', lengthBoundaries(2000), (message) => ({ ...baseQuery(), message }), querySchema);
  push('boundary', 'name', lengthBoundaries(100), (name) => ({ ...baseQuery(), name }), querySchema);
  push('boundary', 'subject', lengthBoundaries(150), (subject) => ({ ...baseQuery(), subject }), querySchema);

  push('redos', 'email', REDOS_PAYLOADS, (email) => ({ ...baseQuery(), email }), querySchema);

  // --- Ticket lookup ------------------------------------------------------

  push('ref number', 'refNumber', REF_NUMBER_PAYLOADS, (refNumber) => ({ ...baseStatus(), refNumber }), statusSchema);
  push('email grammar', 'status email', EMAIL_PAYLOADS, (email) => ({ ...baseStatus(), email }), statusSchema);

  const counts: Record<TextOutcome, number> = {
    ok: 0,
    wrong_verdict: 0,
    slow: 0,
    crash: 0,
  };
  for (const c of cases) counts[c.outcome] += 1;

  return {
    cases,
    counts,
    findings: cases.filter((c) => c.outcome !== 'ok'),
    slowestMs: cases.reduce((max, c) => Math.max(max, c.elapsedMs), 0),
  };
}

export function formatTextReport(report: TextFuzzReport): string {
  const lines = [
    '=== Text fuzzing ===',
    `  ${report.cases.length} cases, ${report.findings.length} finding(s)`,
    `  slowest validation: ${report.slowestMs}ms (bound ${SLOW_MS}ms)`,
    ...Object.entries(report.counts)
      .filter(([, n]) => n > 0)
      .map(([outcome, n]) => `  ${outcome}: ${n}`),
  ];
  for (const finding of report.findings) {
    lines.push(
      `[${finding.outcome}] ${finding.suite} / ${finding.field} / ${finding.label}`,
      `    expected ${finding.expected}, got ${finding.actual} — ${finding.probes}`,
      `    ${finding.detail}`
    );
  }
  return lines.join('\n');
}
