import React, { useState } from 'react';
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  Play,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { studioFetch } from '../lib/api';
import { Badge, Button, Empty, Panel, PanelHead, Spinner, Stat, cx, type Tone } from './ui';

/* -------------------------------------------------------------------------- */

type FuzzOutcome = 'ok' | 'crash' | 'hang' | 'silent_bad_output' | 'skipped';

interface FuzzFinding {
  seed: string;
  mutation: string;
  outcome: FuzzOutcome;
  detail: string;
  iteration: number;
}

type FuzzSuiteId = 'mutation' | 'baseline' | 'text';

interface MutationSummary {
  runs: number;
  rngSeed: number;
  deterministic: boolean;
  seedCorpus: string[];
  counts: Record<FuzzOutcome, number>;
  byMutation: Record<string, Partial<Record<FuzzOutcome, number>>>;
  findings: FuzzFinding[];
}

interface BaselineSummary {
  runs: number;
  rngSeed: number;
  survivors: number;
  survivalRate: number;
  rejectedBy: Record<string, number>;
}

type TextOutcome = 'ok' | 'wrong_verdict' | 'slow' | 'crash';

interface TextSummary {
  totalCases: number;
  counts: Record<TextOutcome, number>;
  slowestMs: number;
  bySuite: Record<string, Partial<Record<TextOutcome, number>>>;
  findings: {
    suite: string; field: string; label: string; outcome: string;
    expected: string; actual: string; probes: string; detail: string;
  }[];
}

interface FuzzRunSummary {
  suite: FuzzSuiteId;
  ok: boolean;
  startedAt: string;
  durationMs: number;
  mutation?: MutationSummary;
  baseline?: BaselineSummary;
  text?: TextSummary;
}

/**
 * The three suites, and what each one is actually claiming.
 *
 * Presented as a choice rather than one button because they answer different
 * questions and produce different shapes of evidence. All three are free and
 * offline; none can reach a paid provider.
 */
const SUITES: {
  id: FuzzSuiteId;
  label: string;
  blurb: string;
  defaultRuns: number | null;
  approxSeconds: (runs: number) => number;
}[] = [
  {
    id: 'mutation',
    label: 'Mutation',
    blurb:
      'Mutates real plant photos and feeds each to the ingest gate. Checks it never crashes, hangs, or misjudges.',
    defaultRuns: 300,
    approxSeconds: (runs) => Math.max(1, Math.round((runs / 300) * 25)),
  },
  {
    id: 'baseline',
    label: 'Random baseline',
    blurb:
      'Fires random payloads at the same gate and counts how many survive. Measures the claim that random testing cannot reach anything interesting here — which is why mutation is a necessity, not a preference.',
    defaultRuns: 10_000,
    approxSeconds: (runs) => Math.max(1, Math.round((runs / 10_000) * 4)),
  },
  {
    id: 'text',
    label: 'Text validators',
    blurb:
      'The contact and ticket schemas: injection payloads, Unicode normalisation, length boundaries, email grammar and ReDoS timing. The control group — free, instant, and a wrong answer is decidable.',
    defaultRuns: null,
    approxSeconds: () => 1,
  },
];

/**
 * What each outcome means, in the operator's terms rather than the runner's.
 *
 * `ok` and `skipped` are not findings. The other three are, and they fail for
 * different reasons — which matters, because "the validator crashed" and "the
 * validator was wrong" need different fixes.
 */
const OUTCOMES: Record<FuzzOutcome, { label: string; tone: Tone; blurb: string }> = {
  ok: {
    label: 'Passed',
    tone: 'ok',
    blurb: 'The gate answered within time, and its verdict matched what the mutant should get.',
  },
  crash: {
    label: 'Crashed',
    tone: 'danger',
    blurb:
      'The gate threw. Always a bug: its contract is to return a result, never to raise — a throw here becomes a 500 on a real scan.',
  },
  hang: {
    label: 'Hung',
    tone: 'danger',
    blurb:
      'The gate exceeded its time budget. A validator that stalls on crafted input is a denial of service even if it never crashes.',
  },
  silent_bad_output: {
    label: 'Wrong verdict',
    tone: 'warn',
    blurb:
      'The gate answered, but wrongly — either hostile input was accepted (a paid Plant.id call spent on garbage) or a genuine photo was refused (a player locked out).',
  },
  skipped: {
    label: 'Skipped',
    tone: 'neutral',
    blurb:
      'The mutation could not be applied to that seed. Not a finding, but a run that is mostly skips is not really testing anything.',
  },
};

/** What each mutation strategy is trying to provoke. */
const MUTATIONS: Record<string, string> = {
  bitflip: 'Flips random bits anywhere in the file. May corrupt the header or merely alter a pixel, so either verdict is acceptable — this one hunts crashes.',
  truncate: 'Cuts the file off partway, as a dropped upload would. Must be rejected: the header still looks valid, so only a real decode catches it.',
  header_corrupt: 'Randomises the first 32 bytes, destroying the format marker. Must be rejected.',
  format_confusion: 'Re-encodes to another format. PNG and WebP must be accepted (they are on the allow-list); GIF and TIFF must be refused.',
  extreme_resize: 'Produces 1x1, 9000x9000 and 4000x4 shapes. All out of policy, all must be rejected.',
  pixel_noise: 'Replaces the image with uniform noise or a flat field. A real, decodable photo — must be ACCEPTED, since judging content is Plant.id’s job, not the gate’s.',
  exif_abuse: 'Strips EXIF, or writes an awkward orientation. Still a valid photo — must be accepted.',
  not_an_image: 'Prose, a script tag, JSON, a fake PDF header. Must be rejected.',
};

function outcomeTone(outcome: FuzzOutcome): Tone {
  return OUTCOMES[outcome]?.tone ?? 'neutral';
}

/* -------------------------------------------------------------------------- */

export const FuzzTests: React.FC = () => {
  const [suite, setSuite] = useState<FuzzSuiteId>('mutation');
  const [result, setResult] = useState<FuzzRunSummary | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<number>(300);
  const [replaySeed, setReplaySeed] = useState('');

  const active = SUITES.find((s) => s.id === suite)!;
  /* The text suite has a fixed case list, so a run count would be a control
     that does nothing. Hidden rather than disabled: a greyed box invites the
     question "why can't I change this?" for no reason. */
  const takesRuns = active.defaultRuns !== null;

  const chooseSuite = (next: FuzzSuiteId) => {
    setSuite(next);
    setError(null);
    // Clear the previous suite's report rather than leave a mismatched one
    // under a new heading.
    setResult(null);
    const def = SUITES.find((s) => s.id === next)!.defaultRuns;
    if (def !== null) setRuns(def);
  };

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await studioFetch('/api/platform/run-fuzz', {
        method: 'POST',
        body: JSON.stringify({
          suite,
          runs: takesRuns ? runs : undefined,
          // Blank means explore; a value means replay that exact run.
          rngSeed: replaySeed.trim() === '' ? undefined : Number(replaySeed.trim()),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Runner returned HTTP ${res.status}`);
        return;
      }
      setResult(data);
    } catch (err: any) {
      setError(err?.message ?? 'Could not reach the fuzz runner.');
    } finally {
      setRunning(false);
    }
  };

  const mutation = result?.mutation;
  const baseline = result?.baseline;
  const text = result?.text;

  const findingCount =
    mutation?.findings.length ?? text?.findings.length ?? baseline?.survivors ?? 0;

  return (
    <div className="space-y-4">
      {/* ---- Suite picker ------------------------------------------------ */}
      <Panel>
        <div
          className="flex flex-wrap gap-2 border-b border-line-soft p-3"
          role="group"
          aria-label="Fuzz suite"
        >
          {SUITES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => chooseSuite(s.id)}
              disabled={running}
              aria-pressed={suite === s.id}
              className={cx(
                'rounded-card border px-3 py-1.5 text-meta font-semibold transition-colors',
                'disabled:pointer-events-none disabled:opacity-40',
                suite === s.id
                  ? 'border-brand bg-brand text-base'
                  : 'border-line bg-raised text-txt-3 hover:border-line-strong hover:text-txt',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card border border-line bg-raised text-brand">
              <Bug className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-body font-semibold text-txt">{active.label}</div>
              <p className="mt-0.5 max-w-2xl text-meta text-txt-4">{active.blurb}</p>
              {result && (
                <p className="mt-1 text-label text-txt-5">
                  Last run {new Date(result.startedAt).toLocaleTimeString()} ·{' '}
                  {(result.durationMs / 1000).toFixed(1)}s
                </p>
              )}
              {/* The reassurance an operator needs BEFORE pressing a button on
                  a page about a pipeline that costs money per run. */}
              <p className="mt-1.5 inline-flex items-center gap-1.5 text-label text-ok">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                Offline. No provider is called and nothing is billed.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            {takesRuns && (
              <div>
                <label
                  htmlFor="fuzz-runs"
                  className="mb-1 block text-label font-medium tracking-wide text-txt-4 uppercase"
                >
                  {suite === 'baseline' ? 'Payloads' : 'Mutations'}
                </label>
                <input
                  id="fuzz-runs"
                  type="number"
                  min={10}
                  max={10000}
                  step={10}
                  value={runs}
                  disabled={running}
                  onChange={(e) => setRuns(Number(e.target.value))}
                  className="w-28 rounded-card border border-line bg-raised px-2.5 py-2 font-mono text-meta text-txt disabled:opacity-40"
                />
              </div>
            )}
            {takesRuns && (
              <div>
                <label
                  htmlFor="fuzz-seed"
                  className="mb-1 block text-label font-medium tracking-wide text-txt-4 uppercase"
                >
                  Replay seed
                </label>
                <input
                  id="fuzz-seed"
                  type="text"
                  inputMode="numeric"
                  placeholder="explore"
                  value={replaySeed}
                  disabled={running}
                  onChange={(e) => setReplaySeed(e.target.value)}
                  aria-describedby="fuzz-seed-help"
                  className="w-32 rounded-card border border-line bg-raised px-2.5 py-2 font-mono text-meta text-txt placeholder:text-txt-4 disabled:opacity-40"
                />
              </div>
            )}
            <Button
              variant="primary"
              onClick={run}
              disabled={running}
              icon={running ? <Spinner /> : <Play className="h-4 w-4" />}
            >
              {running ? 'Running…' : 'Run'}
            </Button>
          </div>
        </div>
        {takesRuns && (
          <p id="fuzz-seed-help" className="border-t border-line-soft px-4 py-2 text-label text-txt-4">
            Leave the seed blank to explore; the seed used is always reported so
            any finding can be replayed. Enter a seed to reproduce an earlier run
            exactly.
          </p>
        )}
      </Panel>

      {error && (
        <Panel className="border-danger/30">
          <div className="flex items-start gap-2.5 p-4 text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 text-meta">{error}</div>
          </div>
        </Panel>
      )}

      {running && (
        <Panel>
          <div className="flex items-center gap-3 p-6 text-txt-3">
            <Spinner className="h-5 w-5" />
            <div className="text-meta">
              Running {active.label.toLowerCase()}
              {takesRuns ? ` — about ${active.approxSeconds(runs)}s.` : '…'}
            </div>
          </div>
        </Panel>
      )}

      {result && !running && (
        <>
          {/* ---- Verdict ------------------------------------------------- */}
          <Panel className={result.ok ? 'border-ok/30' : 'border-danger/30'}>
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5">
                {result.ok ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-ok" />
                ) : (
                  <XCircle className="h-5 w-5 shrink-0 text-danger" />
                )}
                <div className="min-w-0">
                  <div className={cx('text-body font-semibold', result.ok ? 'text-ok' : 'text-danger')}>
                    {result.ok
                      ? 'No findings'
                      : `${findingCount} finding${findingCount === 1 ? '' : 's'} worth triaging`}
                  </div>
                  <p className="mt-0.5 text-meta text-txt-4">
                    {result.ok
                      ? 'Everything was judged correctly, within time, without throwing.'
                      : 'Details below.'}
                  </p>
                </div>
              </div>
              {(mutation || baseline) && (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info" mono>
                    seed {mutation?.rngSeed ?? baseline?.rngSeed}
                  </Badge>
                  <Button
                    size="sm"
                    onClick={() => setReplaySeed(String(mutation?.rngSeed ?? baseline?.rngSeed))}
                    icon={<RotateCcw className="h-3.5 w-3.5" />}
                  >
                    Replay this seed
                  </Button>
                </div>
              )}
            </div>
          </Panel>

          {/* ---- Baseline ------------------------------------------------ */}
          {baseline && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label="Payloads" value={baseline.runs.toLocaleString()} />
                <Stat
                  label="Survived the gate"
                  value={baseline.survivors}
                  tone={baseline.survivors === 0 ? 'ok' : 'danger'}
                  sub={`${(baseline.survivalRate * 100).toFixed(2)}%`}
                />
                <Stat label="Rules exercised" value={Object.keys(baseline.rejectedBy).length} />
              </div>
              <Panel>
                <PanelHead
                  kicker="Funnel"
                  title="What stopped them"
                  sub="The distribution is the real result, not the zero. One rule catching everything would mean the run measured one thing many times rather than covering the gate."
                />
                <ul className="divide-y divide-line-soft">
                  {Object.entries(baseline.rejectedBy)
                    .sort(([, a], [, b]) => b - a)
                    .map(([reason, n]) => (
                      <li key={reason} className="flex items-center justify-between gap-4 px-4 py-2.5">
                        <span className="font-mono text-label text-txt-2">{reason}</span>
                        <span className="flex items-center gap-3">
                          <span className="h-1.5 w-32 overflow-hidden rounded-full bg-raised">
                            <span
                              className="block h-full bg-brand"
                              style={{ width: `${(n / baseline.runs) * 100}%` }}
                            />
                          </span>
                          <span className="w-20 text-right font-mono text-label text-txt-3">
                            {n.toLocaleString()}
                          </span>
                        </span>
                      </li>
                    ))}
                </ul>
              </Panel>
            </>
          )}

          {/* ---- Text ---------------------------------------------------- */}
          {text && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Cases" value={text.totalCases} />
                <Stat label="Passed" value={text.counts.ok} tone="ok" />
                <Stat
                  label="Wrong verdict"
                  value={text.counts.wrong_verdict}
                  tone={text.counts.wrong_verdict > 0 ? 'warn' : 'neutral'}
                />
                <Stat
                  label="Slowest"
                  value={`${text.slowestMs}ms`}
                  tone={text.counts.slow > 0 ? 'danger' : 'neutral'}
                  sub="ReDoS bound 250ms"
                />
              </div>
              <Panel>
                <PanelHead
                  kicker="Coverage"
                  title="By technique"
                  sub="Each group is a different classical technique applied to the same validators."
                />
                <ul className="divide-y divide-line-soft">
                  {Object.entries(text.bySuite)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([name, outcomes]) => (
                      <li key={name} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                        <span className="text-label text-txt-2">{name}</span>
                        <span className="flex flex-wrap gap-1.5">
                          {Object.entries(outcomes).map(([outcome, n]) => (
                            <Badge key={outcome} tone={outcome === 'ok' ? 'ok' : 'warn'} mono>
                              {outcome} {n}
                            </Badge>
                          ))}
                        </span>
                      </li>
                    ))}
                </ul>
              </Panel>
              {text.findings.length > 0 && (
                <Panel>
                  <PanelHead kicker="Triage" title="Findings" icon={<AlertTriangle className="h-4 w-4 text-danger" />} />
                  <ul className="divide-y divide-line-soft">
                    {text.findings.map((f, i) => (
                      <li key={i} className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="warn" dot>{f.outcome}</Badge>
                          <span className="font-mono text-label text-txt-3">{f.suite} / {f.field}</span>
                          <span className="text-label text-txt-4">{f.label}</span>
                        </div>
                        <p className="mt-1.5 text-label text-txt-2">
                          expected {f.expected}, got {f.actual} — {f.probes}
                        </p>
                        <p className="mt-1 font-mono text-label break-words text-txt-4">{f.detail}</p>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
            </>
          )}

          {/* ---- Mutation ------------------------------------------------ */}
          {mutation && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {(Object.keys(OUTCOMES) as FuzzOutcome[]).map((outcome) => (
                  <Stat
                    key={outcome}
                    label={OUTCOMES[outcome].label}
                    value={mutation.counts[outcome] ?? 0}
                    tone={(mutation.counts[outcome] ?? 0) > 0 ? outcomeTone(outcome) : 'neutral'}
                  />
                ))}
              </div>

              {mutation.findings.length > 0 && (
                <Panel>
                  <PanelHead
                    kicker="Triage"
                    title="Findings"
                    sub="Each row names the seed photo, the mutation, and the iteration — enough to reproduce it with the seed above."
                    icon={<AlertTriangle className="h-4 w-4 text-danger" />}
                  />
                  <ul className="divide-y divide-line-soft">
                    {mutation.findings.map((finding, index) => (
                      <li key={`${finding.iteration}-${index}`} className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={outcomeTone(finding.outcome)} dot>
                            {OUTCOMES[finding.outcome]?.label ?? finding.outcome}
                          </Badge>
                          <span className="font-mono text-label text-txt-3">{finding.mutation}</span>
                          <span className="text-label text-txt-4">
                            {finding.seed} · iteration {finding.iteration}
                          </span>
                        </div>
                        <p className="mt-1.5 font-mono text-label break-words text-txt-2">
                          {finding.detail}
                        </p>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}

              <Panel>
                <PanelHead
                  kicker="Coverage"
                  title="By mutation strategy"
                  sub="What each strategy provoked. A strategy showing only skips is not testing anything, which a pass/fail count alone would hide."
                  icon={<Bug className="h-4 w-4 text-brand" />}
                />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[34rem] text-left">
                    <caption className="sr-only">Outcome counts for each mutation strategy</caption>
                    <thead>
                      <tr className="border-b border-line-soft text-label tracking-wide text-txt-4 uppercase">
                        <th scope="col" className="px-4 py-2 font-medium">Strategy</th>
                        <th scope="col" className="px-4 py-2 font-medium">Outcomes</th>
                        <th scope="col" className="px-4 py-2 font-medium">What it probes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-soft">
                      {Object.entries(mutation.byMutation)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([name, outcomes]) => (
                          <tr key={name} className="align-top">
                            <td className="px-4 py-3 font-mono text-label whitespace-nowrap text-txt-2">{name}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1.5">
                                {(Object.entries(outcomes) as [FuzzOutcome, number][]).map(([outcome, n]) => (
                                  <Badge key={outcome} tone={outcomeTone(outcome)} mono>
                                    {OUTCOMES[outcome]?.label ?? outcome} {n}
                                  </Badge>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-label text-txt-4">{MUTATIONS[name] ?? '—'}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel>
                <PanelHead
                  kicker="Reference"
                  title="What the outcomes mean"
                  sub="Crash and hang are always bugs. A wrong verdict is the subtler one, and the class a crash-only fuzzer cannot see."
                />
                <dl className="divide-y divide-line-soft">
                  {(Object.keys(OUTCOMES) as FuzzOutcome[]).map((outcome) => (
                    <div key={outcome} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-4">
                      <dt className="sm:w-36 sm:shrink-0">
                        <Badge tone={OUTCOMES[outcome].tone} dot>{OUTCOMES[outcome].label}</Badge>
                      </dt>
                      <dd className="text-label text-txt-4">{OUTCOMES[outcome].blurb}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>

              <Panel>
                <PanelHead
                  kicker="Inputs"
                  title={`Seed corpus (${mutation.seedCorpus.length} photos)`}
                  sub="Real camera photographs from the pipeline golden set — the same images the pipeline is evaluated against."
                />
                <div className="flex flex-wrap gap-1.5 p-4">
                  {mutation.seedCorpus.map((name) => (
                    <Badge key={name} mono>{name}</Badge>
                  ))}
                </div>
              </Panel>
            </>
          )}
        </>
      )}

      {!result && !running && !error && (
        <Empty
          icon={<Bug className="h-5 w-5" />}
          title="No run yet"
          sub={`Press Run to start the ${active.label.toLowerCase()} suite.`}
        />
      )}
    </div>
  );
};
