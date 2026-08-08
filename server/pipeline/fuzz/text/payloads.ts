/**
 * The text-fuzzing corpus: injection payloads, boundary values and the Unicode
 * forms that only become dangerous after normalisation.
 *
 * Separate from the image work on purpose. The text endpoints are the CONTROL
 * GROUP: both classical fuzzing assumptions hold there — execution is free and
 * a wrong answer is decidable — so techniques that do not transfer to an ML
 * image pipeline can be shown working properly here.
 *
 * Every payload is data. Nothing in this file executes anything; the harness
 * feeds these to Joi schemas and checks the verdict.
 */

/** What the validator should do with a payload. Declared per payload, never
 *  inferred from which list it came out of — the same discipline the image
 *  mutants use, and for the same reason. */
export type TextExpectation = 'accept' | 'reject';

export interface TextPayload {
  label: string;
  value: string;
  expect: TextExpectation;
  /** Why this case exists, surfaced in the report so a finding explains
   *  itself without anyone opening this file. */
  probes: string;
}

/*
  Injection strings.

  IMPORTANT: for a free-text field these must be ACCEPTED. A contact form whose
  message field rejects the word "select" or an angle bracket is a broken
  contact form — someone reporting a bug in the scanner may legitimately need
  to paste markup. Safety at this layer is escaping on output, not refusal on
  input, and a validator that confuses the two produces a filter that blocks
  real users while stopping nothing.

  What is being tested here is therefore NOT "does it reject these" but "does
  it survive them, store them faithfully, and neither crash nor mangle them".
*/
export const INJECTION_PAYLOADS: TextPayload[] = [
  {
    label: 'script tag',
    value: '<script>alert(1)</script>',
    expect: 'accept',
    probes: 'stored as text; escaping is the renderer’s job, not the validator’s',
  },
  {
    label: 'img onerror',
    value: '<img src=x onerror=alert(1)>',
    expect: 'accept',
    probes: 'attribute-based XSS vector survives as inert text',
  },
  {
    label: 'sql fragment',
    value: "'; DROP TABLE users; --",
    expect: 'accept',
    probes: 'Firestore is not SQL, but the string must not break serialisation',
  },
  {
    label: 'template expression',
    value: '${1+1} {{7*7}}',
    expect: 'accept',
    probes: 'never interpolated by a template engine downstream',
  },
  {
    label: 'xml entity',
    value: '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>',
    expect: 'accept',
    probes: 'XXE payload as inert text; nothing here parses XML',
  },
  {
    label: 'null byte',
    value: 'hello\u0000world',
    expect: 'accept',
    probes: 'truncation bugs in anything treating strings as C strings',
  },
  {
    label: 'crlf header split',
    value: 'subject\r\nX-Injected: yes',
    expect: 'accept',
    probes: 'must not become two headers if echoed into an email',
  },
];

/*
  The normalisation pairing, and the reason it is worth its own list.

  Fullwidth forms are visually distinct but collapse to ASCII under NFKC. If
  anything validates BEFORE normalising and stores AFTER, a filter that blocks
  `<script>` waves `＜script＞` through and it becomes `<script>` on the way to
  storage. The pair is the test: both must reach the same fate.
*/
export const NORMALISATION_PAYLOADS: TextPayload[] = [
  {
    label: 'fullwidth script tag',
    value: '＜script＞alert(1)＜/script＞',
    expect: 'accept',
    probes: 'NFKC-collapses to <script>; must share the plain form’s fate',
  },
  {
    label: 'fullwidth quote and semicolon',
    value: '＇； DROP TABLE users； --',
    expect: 'accept',
    probes: 'fullwidth punctuation normalising into SQL metacharacters',
  },
  {
    label: 'zero-width joiner inside a word',
    value: 'scr‍ipt',
    expect: 'accept',
    probes: 'invisible characters defeating a naive substring filter',
  },
  {
    label: 'right-to-left override',
    value: 'filename‮gnp.exe',
    expect: 'accept',
    probes: 'display-order spoofing if ever rendered unescaped',
  },
];

/** Email addresses, valid and not. The one field here with a real grammar. */
export const EMAIL_PAYLOADS: TextPayload[] = [
  { label: 'plain', value: 'ada@example.com', expect: 'accept', probes: 'the ordinary case' },
  { label: 'plus addressing', value: 'ada+tag@example.com', expect: 'accept', probes: 'RFC-valid, commonly mishandled' },
  { label: 'subdomain', value: 'ada@mail.example.co.uk', expect: 'accept', probes: 'multi-label domain' },
  { label: 'digits in domain', value: 'ada@ex4mple.com', expect: 'accept', probes: 'alphanumeric labels' },
  { label: 'no at sign', value: 'ada.example.com', expect: 'reject', probes: 'missing separator' },
  { label: 'double at', value: 'ada@@example.com', expect: 'reject', probes: 'repeated separator' },
  { label: 'leading dot', value: '.ada@example.com', expect: 'reject', probes: 'local part cannot start with a dot' },
  { label: 'trailing dot in local', value: 'ada.@example.com', expect: 'reject', probes: 'local part cannot end with a dot' },
  { label: 'consecutive dots', value: 'a..b@example.com', expect: 'reject', probes: 'empty label inside the local part' },
  { label: 'no domain', value: 'ada@', expect: 'reject', probes: 'empty domain' },
  { label: 'no tld', value: 'ada@example', expect: 'reject', probes: 'Joi requires a TLD by default' },
  { label: 'space inside', value: 'ada smith@example.com', expect: 'reject', probes: 'unquoted whitespace' },
  { label: 'newline injection', value: 'ada@example.com\nBcc: evil@example.com', expect: 'reject', probes: 'header injection through the address field' },
  { label: 'empty', value: '', expect: 'reject', probes: 'required field' },
];

/**
 * Boundary values for a length-capped field.
 *
 * The classic off-by-one triple, plus the cases a `.max(n)` on a JS string
 * gets wrong in a way nobody notices: an emoji is two UTF-16 units, so 1,000
 * emoji fill a 2,000-"character" cap.
 */
export function lengthBoundaries(max: number): TextPayload[] {
  return [
    { label: `${max - 1} chars`, value: 'a'.repeat(max - 1), expect: 'accept', probes: 'just inside the cap' },
    { label: `${max} chars`, value: 'a'.repeat(max), expect: 'accept', probes: 'exactly the cap — the boundary itself' },
    { label: `${max + 1} chars`, value: 'a'.repeat(max + 1), expect: 'reject', probes: 'one past the cap' },
    { label: 'empty', value: '', expect: 'reject', probes: 'min(1) on a required field' },
    { label: 'whitespace only', value: '   ', expect: 'reject', probes: 'trim() runs before min(1)' },
    {
      label: `${max / 2} emoji`,
      value: '🌱'.repeat(Math.floor(max / 2)),
      expect: 'accept',
      probes: 'UTF-16 units, not characters: each emoji costs two',
    },
    {
      label: `${max / 2 + 1} emoji`,
      value: '🌱'.repeat(Math.floor(max / 2) + 1),
      expect: 'reject',
      probes: 'one emoji past the cap, which is two units past',
    },
  ];
}

/** Reference numbers for the ticket lookup, whose format is SPR-YYYYMMDD-NNNN. */
export const REF_NUMBER_PAYLOADS: TextPayload[] = [
  { label: 'canonical', value: 'SPR-20260712-0001', expect: 'accept', probes: 'the documented format' },
  { label: 'lowercase prefix', value: 'spr-20260712-0001', expect: 'accept', probes: 'the pattern accepts either case' },
  { label: 'mixed case', value: 'SpR-20260712-0001', expect: 'accept', probes: 'per-character case insensitivity' },
  { label: 'short date', value: 'SPR-2026071-0001', expect: 'reject', probes: 'seven date digits instead of eight' },
  { label: 'short serial', value: 'SPR-20260712-001', expect: 'reject', probes: 'three serial digits instead of four' },
  { label: 'negative serial', value: 'SPR-20260712--001', expect: 'reject', probes: 'a sign where a digit belongs' },
  { label: 'scientific notation', value: 'SPR-20260712-1e10', expect: 'reject', probes: 'numeric-looking but not digits' },
  { label: 'sql in the id', value: "SPR-20260712-0001' OR '1'='1", expect: 'reject', probes: 'the pattern anchors, so this cannot pass' },
  { label: 'leading whitespace', value: '  SPR-20260712-0001  ', expect: 'accept', probes: 'trim() runs before the pattern' },
  { label: 'unicode digits', value: 'SPR-٢٠٢٦٠٧١٢-0001', expect: 'reject', probes: 'Arabic-Indic digits are not \\d in a non-unicode regex' },
  { label: 'empty', value: '', expect: 'reject', probes: 'required field' },
];

/**
 * The ReDoS probe.
 *
 * Nested quantifiers against a backtracking engine. Joi's email validator is
 * NOT regex-backtracking — measured at about 1ms on these — so this is
 * expected to be a NEGATIVE result, and that is worth recording rather than
 * quietly dropping. The assertion is a time bound: a validator that returns
 * the right answer after eight seconds has already failed.
 */
export const REDOS_PAYLOADS: TextPayload[] = [
  { label: 'nested quantifier local part', value: `${'a'.repeat(60)}@${'a'.repeat(60)}`, expect: 'reject', probes: 'classic catastrophic-backtracking shape' },
  { label: 'long local part', value: `${'a'.repeat(5_000)}@example.com`, expect: 'reject', probes: 'linear-time blowup on a long input' },
  { label: 'many dots', value: `${'a.'.repeat(500)}a@example.com`, expect: 'reject', probes: 'repeated optional groups' },
  { label: 'many at signs', value: `${'a@'.repeat(500)}example.com`, expect: 'reject', probes: 'ambiguous separator positions' },
];
