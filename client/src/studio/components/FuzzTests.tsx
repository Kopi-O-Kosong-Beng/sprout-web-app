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
      'Takes a real plant photo and breaks it in one specific way — cuts it short, scrambles its header, replaces it with static — then checks the upload checker gives the right answer. Broken files must be refused; still-valid ones must be let through.',
    defaultRuns: 300,
    approxSeconds: (runs) => Math.max(1, Math.round((runs / 300) * 7)),
  },
  {
    id: 'baseline',
    label: 'Random baseline',
    blurb:
      'Throws completely random junk at the same upload checker and counts how much survives. The answer is zero — which is exactly the point. Random bytes never even resemble an image, so breaking real photos is the only way to reach anything worth testing.',
    defaultRuns: 10_000,
    approxSeconds: (runs) => Math.max(1, Math.round((runs / 10_000) * 4)),
  },
  {
    id: 'text',
    label: 'Text validators',
    blurb:
      'Checks the contact form and ticket lookup rules against awkward input: an address like a@@b, a message one character over the limit, pasted HTML, an emoji that secretly counts as two characters. Every case here has an obviously right answer, which makes it the easy half.',
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
    blurb:
      'The checker answered in time, and gave the answer this input was supposed to get. Note that "passed" can mean it correctly ACCEPTED something — not every input here is meant to be refused.',
  },
  crash: {
    label: 'Crashed',
    tone: 'danger',
    blurb:
      'The checker threw an error instead of returning an answer. Always a bug: it is supposed to hand back a yes or a no, whatever it is given. On a real scan this becomes a 500 error page.',
  },
  hang: {
    label: 'Hung',
    tone: 'danger',
    blurb:
      'The checker took longer than its time limit. Even with no crash, an input that makes it stall is a way to take the server down — send a few of those and nobody else gets served.',
  },
  silent_bad_output: {
    label: 'Wrong verdict',
    tone: 'warn',
    blurb:
      'The checker answered, but the answer was wrong. Either it accepted a broken file — so we pay Plant.id to look at garbage — or it refused a real photo, which locks a player out. Nothing crashes, so this is the one you would never notice without checking.',
  },
  skipped: {
    label: 'Skipped',
    tone: 'neutral',
    blurb:
      'This kind of damage could not be applied to that photo — you cannot cut 20 bytes off a 10-byte file. Not a problem in itself, but a run that is mostly skips has not tested much.',
  },
};

/** What each way of breaking a photo does, and what the checker owes in reply. */
const MUTATIONS: Record<string, string> = {
  bitflip:
    'Flips a handful of random bits, like a download that got slightly corrupted. It might wreck the part that says "this is a JPEG", or it might just change one pixel — so either answer counts as correct. This one is hunting for crashes rather than wrong answers.',
  truncate:
    'Chops the end off the file, the way an upload cut off halfway would arrive. Must be REFUSED — and it is the sneaky one, because the start of the file still looks perfectly fine. The only way to catch it is to actually decode the picture and notice it stops early.',
  header_corrupt:
    'Scrambles the first 32 bytes — the part that says which image format this is. With that gone, nothing can read the file at all. Must be REFUSED.',
  format_confusion:
    'Re-saves the same photo in a different image format. PNG and WebP are on our allowed list, so those must be ACCEPTED; GIF and TIFF are not, so those must be REFUSED. Tests that we judge the actual bytes rather than trusting whatever the uploader claims.',
  extreme_resize:
    'Absurd shapes: a single pixel, a 4000x4 strip, a 4x4000 strip, and a tiny file whose header lies and claims to be 8000x8000. All are outside the sizes we allow, so all must be REFUSED. That last one is a "decompression bomb" — a small file that tries to trick the server into allocating a huge amount of memory.',
  pixel_noise:
    'Replaces the picture with TV static or a solid block of colour. This must be ACCEPTED — it is still a perfectly valid image file, and deciding whether it contains a plant is Plant.id’s job, not this checker’s. Someone photographing a blank wall must not get an error.',
  exif_abuse:
    'Removes or scrambles the camera metadata — including the tag saying which way up the photo is. Still a real photo, so it must be ACCEPTED. A phone with an unusual sensor cannot be locked out of the game.',
  not_an_image:
    'Sends something that was never an image: plain text, a script tag, JSON, a fake PDF header, a file path. All must be REFUSED.',
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
            Leave this blank and every run picks a fresh random seed, so each one
            explores different damage — that is why the seed number changes each
            time you press Run. Whichever seed was used is always shown with the
            results. Type one in to repeat an earlier run exactly: the same seed
            gives the same photos, the same damage and the same answers, every
            time and on any machine.
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
                  sub="The spread matters more than the zero. If one rule caught all of them, we would have tested that single rule thousands of times rather than testing the checker. Two rules sharing the load means the junk is failing for genuinely different reasons."
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
                  sub="limit 250ms"
                />
              </div>
              <Panel>
                <PanelHead
                  kicker="Coverage"
                  title="By technique"
                  sub="Each group probes the same two forms a different way: awkward email addresses, messages that sit right on the length limit, pasted HTML, and inputs designed to make the checking itself slow."
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
                  sub="What each way of breaking a photo actually produced. Watch for a row that is all skips — that damage never applied to any photo, so it tested nothing, and a plain pass/fail count would hide that."
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
                  sub="Crashed and Hung are always real bugs. Wrong verdict is the subtle one: nothing visibly breaks, so a test that only watches for crashes would report everything as fine."
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
                  sub="Real camera photographs, reused from the set the pipeline is graded against. Each run picks from these at random and damages a fresh copy — the originals are never altered."
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
