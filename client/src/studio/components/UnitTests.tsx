import React, { useState } from 'react';
import { studioFetch } from '../lib/api';
import { AlertTriangle, CheckCircle2, ChevronDown, FlaskConical, Play, Terminal, XCircle } from 'lucide-react';
import { Badge, Button, Empty, Panel, Spinner, Stat, cx, type Tone } from './ui';

/* -------------------------------------------------------------------------- */

interface TestCase {
  id: string;
  file: string;
  suite: string[];
  title: string;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  output: string;
}

interface TestRunResult {
  ok: boolean;
  startedAt: string;
  durationMs: number;
  totals: { total: number; passed: number; failed: number; skipped: number; files: number };
  cases: TestCase[];
  rawOutput: string;
  error?: string;
}

/**
 * What each spec file covers, in plain language. The it() titles say what a
 * single case asserts; this says why the file exists at all.
 */
const FILE_SUBJECTS: Record<string, string> = {
  'approve.test.ts': 'Auto-approval gate — what may reach the Dex unreviewed',
  'finishSprite.test.ts': 'Finisher — 192×192 downscale, island removal, palette snap',
  'promptCraft.test.ts': 'Prompt crafting — tier routing and VLM preamble stripping',
  'programmaticEval.test.ts': 'Deterministic sprite checks — palette, alpha, blankness',
  'removeBg.test.ts': 'Background cutout — graceful degradation when it fails',
  'assemblePlant.test.ts': 'Monster assembly — stats, speed range and move sets',
  'identify.test.ts': 'Plant.id identification — plant vs non-plant input classes',
  'generateSprite.test.ts': 'Render providers — fallback when one runs out of credit',
};

/**
 * Testing technique each case uses. The distinction is about what knowledge the
 * test was written with, not what it touches.
 */
type TestKind = 'black' | 'white' | 'fault';

/**
 * Formal black-box design techniques. Not every case needs one — some are plain
 * output assertions — but where a case was derived by a named method, saying so
 * is more informative than "black box" alone.
 */
type Technique = 'boundary' | 'equivalence' | 'decision';

const TECHNIQUES: Record<Technique, { label: string; blurb: string }> = {
  boundary: {
    label: 'Boundary value',
    blurb: 'Probes the edge of a range — the threshold itself and the value just past it.',
  },
  equivalence: {
    label: 'Equivalence class',
    blurb: 'One representative per input class, valid and invalid, on the basis that a class behaves uniformly.',
  },
  decision: {
    label: 'Decision table',
    blurb: 'One rule per row of the condition/action table — all conditions true, then each in turn falsified.',
  },
};

const KINDS: Record<TestKind | 'unclassified', { title: string; blurb: string; tone: Tone }> = {
  black: {
    title: 'Black box',
    blurb:
      'Written from the specification alone. Inputs go in, outputs are asserted, and nothing about the implementation is assumed — these would still pass after a rewrite.',
    tone: 'info',
  },
  white: {
    title: 'White box',
    blurb:
      'Written with the implementation in view to reach specific internal branches and algorithms. These cover paths a spec-only test would never think to try.',
    tone: 'gold',
  },
  fault: {
    title: 'Fault injection',
    blurb:
      'A dependency is deliberately made to fail — a timeout, a 429, a 402 — to prove the pipeline degrades to a lower tier instead of collapsing.',
    tone: 'gate',
  },
  unclassified: {
    title: 'Unclassified',
    blurb:
      'Present in the suite but not yet categorised here. Add an entry to TEST_META to file it under a technique.',
    tone: 'neutral',
  },
};

const KIND_ORDER: (TestKind | 'unclassified')[] = ['black', 'white', 'fault', 'unclassified'];
const TECHNIQUE_ORDER: Technique[] = ['boundary', 'equivalence', 'decision'];

/**
 * Per-case presentation metadata, keyed by `<spec file>::<it() title>`.
 *
 * `label` is a short readable name for the card heading; `checks` states what
 * the case actually verified, and is paired with the measured latency in the
 * result line. Both are authored here — the terminal block above them stays
 * verbatim Vitest output, so a reader can always tell the two apart.
 */
const TEST_META: Record<string, { label: string; checks: string; kind: TestKind; technique?: Technique }> = {
  // Auto-approval gate
  'approve.test.ts::approves when every programmatic check passes and the judge meets the threshold':
    { label: 'Approves a clean, well-judged sprite', checks: 'All four gates pass', kind: 'black', technique: 'decision' },
  'approve.test.ts::refuses to approve when the judge did not score at all':
    { label: 'Unscored sprite is never auto-approved', checks: 'Fails closed on a missing judge score', kind: 'white' },
  'approve.test.ts::refuses to approve on a judge score below the threshold':
    { label: 'Low judge score blocks approval', checks: 'Score under the threshold rejected', kind: 'black', technique: 'boundary' },
  'approve.test.ts::treats a zero score as a fail rather than a missing value':
    { label: 'Zero is a failing score, not an absent one', checks: 'Explicit 0 rejected', kind: 'white' },
  'approve.test.ts::refuses to approve when background removal degraded':
    { label: 'Degraded cutout blocks approval', checks: 'removeBgOk false rejected', kind: 'black', technique: 'decision' },
  'approve.test.ts::refuses to approve when paletteValid fails':
    { label: 'Off-palette sprite blocked', checks: 'paletteValid false rejected', kind: 'black', technique: 'decision' },
  'approve.test.ts::refuses to approve when dimsOk fails':
    { label: 'Wrong dimensions blocked', checks: 'dimsOk false rejected', kind: 'black', technique: 'decision' },
  'approve.test.ts::refuses to approve when notBlank fails':
    { label: 'Blank sprite blocked', checks: 'notBlank false rejected', kind: 'black', technique: 'decision' },

  // Finisher
  'finishSprite.test.ts::snaps every opaque pixel into SPROUT_PALETTE and sets dimensions to 192x192':
    { label: 'Palette snap and 192×192 resize', checks: 'Every opaque pixel on-palette, dimensions exact', kind: 'black' },
  'finishSprite.test.ts::preserves transparent pixels':
    { label: 'Transparency check for background', checks: 'Alpha survives the finisher', kind: 'black', technique: 'equivalence' },
  'finishSprite.test.ts::drops stray islands that are disconnected from the main subject':
    { label: 'Stray island removal', checks: 'Detached region cleared, subject kept', kind: 'white' },
  'finishSprite.test.ts::crops photo to 192x192 PNG buffer for Tier 4 fallback':
    { label: 'Tier 4 photo-crop fallback', checks: 'Centre crop emits a 192×192 PNG', kind: 'black' },

  // Deterministic sprite checks
  'programmaticEval.test.ts::passes a clean on-palette sprite with transparency':
    { label: 'Clean sprite passes every check', checks: 'All three checks pass', kind: 'black', technique: 'equivalence' },
  'programmaticEval.test.ts::fails a blank (all transparent) sprite':
    { label: 'Blank sprite is rejected', checks: 'notBlank correctly fails', kind: 'black', technique: 'equivalence' },

  // Prompt crafting
  'promptCraft.test.ts::strips conversational refusal headers and extracts pure prompt instruction':
    { label: 'VLM preamble stripping', checks: 'Refusal preamble removed from the prompt', kind: 'black' },
  'promptCraft.test.ts::returns Tier 1 Gemini when the Gemini call succeeds':
    { label: 'Tier 1 Gemini fast path', checks: 'Gemini used, slow fallback never called', kind: 'white' },
  'promptCraft.test.ts::falls back to Tier 2 NVIDIA when Gemini times out':
    { label: 'Gemini timeout falls through to NVIDIA', checks: 'Tier 2 engaged after the 20s cap', kind: 'fault' },
  'promptCraft.test.ts::falls back to Tier 2 NVIDIA when Gemini throws immediately':
    { label: 'Gemini error falls through to NVIDIA', checks: 'Tier 2 engaged on a 429', kind: 'fault' },
  'promptCraft.test.ts::skips Tier 1 entirely when no Gemini key is configured':
    { label: 'Missing Gemini key skips Tier 1', checks: 'Goes straight to NVIDIA', kind: 'white' },
  'promptCraft.test.ts::falls back to Tier 3 nameOnly when both vision models fail':
    { label: 'Both vision models down falls to name-only', checks: 'Tier 3 species-dictionary prompt used', kind: 'fault' },

  // Background cutout
  'removeBg.test.ts::degrades gracefully to original buffer and sets removeBgOk = false when key is missing or call fails':
    { label: 'Cutout degrades without failing the run', checks: 'Raw render kept, removeBgOk false', kind: 'fault' },

  // Monster assembly
  'assemblePlant.test.ts::creates a plant with maxHealth = 100, speed in range 5-20, and 4 moves':
    { label: 'Stats and move set generation', checks: 'HP 100, speed in range, 4 moves', kind: 'black', technique: 'boundary' },
  'assemblePlant.test.ts::uses default move set on manual name or unknown taxonomy path':
    { label: 'Default moves on unknown taxonomy', checks: 'Manual path receives the default set', kind: 'black', technique: 'equivalence' },
};

const shortFile = (file: string) => file.split('/').pop() ?? file;

/**
 * Tests added since the coverage audit carry their technique as a `[TAG]`
 * prefix in the name. Deriving from that keeps new tests categorised without a
 * matching TEST_META entry — otherwise every test written from here on lands in
 * Unclassified until someone remembers to register it.
 */
const TAG_RULES: { match: RegExp; kind: TestKind; technique?: Technique }[] = [
  { match: /^\[EP\]/i, kind: 'black', technique: 'equivalence' },
  { match: /^\[BVA-robust\]/i, kind: 'black', technique: 'boundary' },
  { match: /^\[BVA\]/i, kind: 'black', technique: 'boundary' },
  { match: /^\[decision-table[^\]]*\]/i, kind: 'black', technique: 'decision' },
  { match: /^\[MCDC\]/i, kind: 'white' },
  { match: /^\[path\]/i, kind: 'white' },
  { match: /^\[fault\]/i, kind: 'fault' },
];

const fromTag = (title: string) => TAG_RULES.find((r) => r.match.test(title.trim()));

/** Curated entry wins; a tag prefix is the fallback. */
const metaFor = (test: { file: string; title: string }) => {
  const curated = TEST_META[`${shortFile(test.file)}::${test.title}`];
  if (curated) return curated;

  const tag = fromTag(test.title);
  if (!tag) return undefined;

  return {
    // Strip the tag from the heading — it is shown as a badge instead.
    label: test.title.replace(/^\[[^\]]+\]\s*/, ''),
    checks: '',
    kind: tag.kind,
    technique: tag.technique,
  };
};

/** A test with neither a curated entry nor a tag still shows, under Unclassified. */
const kindOf = (test: { file: string; title: string }): TestKind | 'unclassified' =>
  metaFor(test)?.kind ?? fromTag(test.title)?.kind ?? 'unclassified';

/** Group headings use a dot rather than a full badge, so tones map directly. */
const TONE_DOT: Record<Tone, string> = {
  neutral: 'bg-txt-4',
  brand: 'bg-brand',
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  gate: 'bg-gate',
  info: 'bg-info',
  gold: 'bg-gold',
};

const STATUS: Record<TestCase['status'], { tone: Tone; label: string; Icon: typeof CheckCircle2 }> = {
  passed: { tone: 'ok', label: 'PASS', Icon: CheckCircle2 },
  failed: { tone: 'danger', label: 'FAIL', Icon: XCircle },
  skipped: { tone: 'warn', label: 'SKIP', Icon: AlertTriangle },
};

/* -------------------------------------------------------------------------- */

export const UnitTests: React.FC = () => {
  const [result, setResult] = useState<TestRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const runTests = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await studioFetch('/api/platform/run-tests', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Runner returned HTTP ${res.status}`);
        return;
      }
      setResult(data);
      // A runner-level failure (no JSON report, zero test files found) has its
      // whole story in the raw stream — open it rather than leaving the
      // explanation collapsed behind the toggle.
      if (data.error) setShowRaw(true);
    } catch (err: any) {
      setError(err?.message ?? 'Could not reach the test runner.');
    } finally {
      setRunning(false);
    }
  };

  const totals = result?.totals;

  return (
    <div className="space-y-4">
      {/* ---- Control bar ---- */}
      <Panel>
        <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card border border-line bg-raised text-brand">
              <FlaskConical className="h-5 w-5" />
            </div>
            <div>
              <div className="text-body font-semibold text-txt">Vitest suite</div>
              <p className="mt-0.5 text-meta text-txt-4">
                {result
                  ? `Last run ${new Date(result.startedAt).toLocaleTimeString()} · ${(result.durationMs / 1000).toFixed(2)}s · ${totals?.files} spec files`
                  : 'Runs the real suite in this repository — nothing is stubbed.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {result && (
              <Badge tone={result.ok ? 'ok' : 'danger'} dot>
                {/* Not-ok with zero failures means the RUNNER failed (no
                    report, no test files) — "0 FAILING" would be nonsense. */}
                {result.ok
                  ? 'ALL PASSING'
                  : totals?.failed
                    ? `${totals.failed} FAILING`
                    : 'RUN FAILED'}
              </Badge>
            )}
            <Button
              variant="primary"
              size="lg"
              onClick={runTests}
              disabled={running}
              icon={running ? <Spinner className="h-4 w-4 border-base/30 border-t-base" /> : <Play className="h-4 w-4 fill-current" />}
            >
              {running ? 'Running suite…' : result ? 'Re-run tests' : 'Run tests'}
            </Button>
          </div>
        </div>

        {totals && (
          <div className="grid grid-cols-2 gap-3 border-t border-line-soft p-4 sm:grid-cols-4">
            <Stat label="Total" value={totals.total} tone="info" />
            <Stat label="Passed" value={totals.passed} tone="ok" />
            <Stat label="Failed" value={totals.failed} tone={totals.failed > 0 ? 'danger' : 'neutral'} />
            <Stat label="Skipped" value={totals.skipped} tone={totals.skipped > 0 ? 'warn' : 'neutral'} />
          </div>
        )}

        {/* Per-technique breakdown — the headline totals say the suite is green,
            this says which kinds of testing are actually covered. */}
        {result && (
          <div className="space-y-2 border-t border-line-soft p-4">
            <div className="pixel-label mb-2.5 text-txt-4">Coverage by technique</div>

            {KIND_ORDER.map((kind) => {
              const group = result.cases.filter((t) => kindOf(t) === kind);
              if (group.length === 0) return null;
              const passed = group.filter((t) => t.status === 'passed').length;
              const clean = passed === group.length;

              const byTechnique = TECHNIQUE_ORDER.map((tech) => {
                const sub = group.filter((t) => metaFor(t)?.technique === tech);
                if (sub.length === 0) return null;
                return {
                  tech,
                  passed: sub.filter((t) => t.status === 'passed').length,
                  total: sub.length,
                };
              }).filter(Boolean) as { tech: Technique; passed: number; total: number }[];

              return (
                <div key={kind} className="rounded-card border border-line-soft bg-raised px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-meta font-semibold text-txt">
                      <span className={cx('h-2 w-2 rounded-full', TONE_DOT[KINDS[kind].tone])} />
                      {KINDS[kind].title}
                    </span>
                    <span
                      className={cx('font-mono text-meta font-bold', clean ? 'text-ok' : 'text-danger')}
                    >
                      {passed}/{group.length} passed
                    </span>
                  </div>

                  {byTechnique.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-line-soft pt-2">
                      {byTechnique.map(({ tech, passed: p, total: t }) => (
                        <span
                          key={tech}
                          title={TECHNIQUES[tech].blurb}
                          className="rounded-chip border border-line bg-void px-2 py-0.5 font-mono text-[10px] text-txt-3"
                        >
                          {TECHNIQUES[tech].label}{' '}
                          <span className={p === t ? 'text-ok' : 'text-danger'}>
                            {p}/{t}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {error && (
        <div className="flex items-start gap-2.5 rounded-card border border-danger/30 bg-danger/10 p-3">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="text-meta text-txt-2">{error}</p>
        </div>
      )}

      {result?.error && (
        <div className="flex items-start gap-2.5 rounded-card border border-warn/30 bg-warn/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <p className="text-meta text-txt-2">{result.error}</p>
        </div>
      )}

      {/* ---- Cards ---- */}
      {running && !result ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <Spinner className="h-8 w-8" />
          <p className="text-meta text-txt-4">Spawning vitest and collecting results…</p>
        </div>
      ) : !result ? (
        <Empty
          icon={<FlaskConical className="h-10 w-10" />}
          title="No run yet"
          sub="Press Run tests to execute the suite. Each case appears as a card with its assertion, the terminal output it produced, and a pass/fail result."
        />
      ) : (
        <div className="space-y-6">
          {KIND_ORDER.map((kind) => {
            const group = result.cases.filter((t) => kindOf(t) === kind);
            if (group.length === 0) return null;

            const failed = group.filter((t) => t.status === 'failed').length;
            const { title, blurb, tone } = KINDS[kind];

            return (
              <section key={kind}>
                <div className="mb-3 flex flex-col gap-2 border-b border-line pb-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="flex items-center gap-2.5 text-title font-semibold text-txt">
                      <span className={cx('h-2.5 w-2.5 rounded-full', TONE_DOT[tone])} />
                      {title}
                      <span className="font-mono text-meta font-normal text-txt-4">
                        {group.length}
                      </span>
                    </h2>
                    <p className="mt-1.5 max-w-3xl text-meta leading-relaxed text-txt-4">{blurb}</p>
                    {kind === 'black' && (
                      <div className="mt-2 flex flex-wrap gap-3">
                        {TECHNIQUE_ORDER.map((tech) => {
                          const n = group.filter((t) => metaFor(t)?.technique === tech).length;
                          if (n === 0) return null;
                          return (
                            <span key={tech} className="text-label text-txt-5">
                              <span className="text-info">{TECHNIQUES[tech].label}</span>{' '}
                              — {TECHNIQUES[tech].blurb}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <Badge tone={failed > 0 ? 'danger' : 'ok'} dot className="shrink-0">
                    {failed > 0 ? `${failed} failing` : `${group.length} passing`}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {group.map((test) => (
                    <TestCard key={test.id} test={test} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ---- Full console ---- */}
      {result?.rawOutput && (
        <Panel>
          <button
            onClick={() => setShowRaw((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            aria-expanded={showRaw}
          >
            <span className="flex items-center gap-2 text-body font-semibold text-txt">
              <Terminal className="h-4 w-4 text-txt-4" />
              Full terminal output
            </span>
            <ChevronDown className={cx('h-4 w-4 text-txt-4 transition-transform', showRaw && 'rotate-180')} />
          </button>
          {showRaw && (
            <pre className="max-h-[420px] overflow-auto border-t border-line-soft bg-void p-4 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-txt-3">
              {result.rawOutput}
            </pre>
          )}
        </Panel>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */

const TestCard: React.FC<{ test: TestCase }> = ({ test }) => {
  const { tone, label, Icon } = STATUS[test.status];
  const file = shortFile(test.file);
  const meta = metaFor(test);

  return (
    <Panel
      className={cx(
        'flex flex-col',
        test.status === 'failed' ? 'border-danger/40' : test.status === 'skipped' ? 'border-warn/30' : '',
      )}
    >
      {/* Title, then what this area of the pipeline covers */}
      <div className="border-b border-line-soft p-3.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="pixel-label truncate text-txt-4" title={test.file}>
            {file}
          </span>
          {meta?.technique && (
            <span
              title={TECHNIQUES[meta.technique].blurb}
              className="shrink-0 rounded-chip border border-info/25 bg-info/10 px-1.5 py-0.5 text-[9px] font-semibold text-info"
            >
              {TECHNIQUES[meta.technique].label}
            </span>
          )}
        </div>
        <h3 className="text-meta leading-snug font-semibold text-txt">{meta?.label ?? test.title}</h3>
        <p className="mt-1.5 text-label leading-relaxed text-txt-4">
          {FILE_SUBJECTS[file] ?? 'Pipeline behaviour under test'}
        </p>
        {/* The real it() title, so the readable label never hides the source. */}
        {meta && (
          <p className="mt-1.5 line-clamp-2 font-mono text-[10px] text-txt-5" title={test.title}>
            it({test.title})
          </p>
        )}
      </div>

      {/* Verbatim Vitest output, then the scored result and latency */}
      <div className="flex-1 p-3.5">
        <div className="pixel-label mb-1.5 flex items-center gap-1.5 text-txt-5">
          <Terminal className="h-3 w-3" />
          Terminal
        </div>
        <pre className="max-h-40 overflow-auto rounded-card border border-line-soft bg-void p-2.5 font-mono text-[10px] leading-relaxed break-all whitespace-pre-wrap text-txt-3">
          {test.output || '(no output)'}
        </pre>

        <div
          className={cx(
            'mt-2 flex items-baseline justify-between gap-2 rounded-card border px-2.5 py-1.5 font-mono text-[10px]',
            tone === 'ok' ? 'border-ok/25 bg-ok/8' : tone === 'danger' ? 'border-danger/25 bg-danger/8' : 'border-warn/25 bg-warn/8',
          )}
        >
          {/* `checks` is an authored claim about what the case proves, so it may
              only be stated when the case actually passed. On a red run it is
              what did NOT hold — printing it plain would read as a pass. */}
          <span className={cx(tone === 'ok' ? 'text-ok' : tone === 'danger' ? 'text-danger' : 'text-warn')}>
            {test.status === 'passed'
              ? meta?.checks || 'Assertions passed'
              : test.status === 'failed'
                ? meta?.checks
                  ? `Did not hold: ${meta.checks}`
                  : 'Assertions failed'
                : 'Not run — no assertions were evaluated'}
          </span>
          <span className="shrink-0 text-txt-4">{test.durationMs}ms</span>
        </div>
      </div>

      {/* Result */}
      <div className="flex items-center justify-between border-t border-line-soft px-3.5 py-2.5">
        <span className="truncate font-mono text-[10px] text-txt-5" title={test.suite.join(' › ')}>
          {test.suite.join(' › ')}
        </span>
        <Badge tone={tone}>
          <Icon className="h-3 w-3" />
          {label}
        </Badge>
      </div>
    </Panel>
  );
};
