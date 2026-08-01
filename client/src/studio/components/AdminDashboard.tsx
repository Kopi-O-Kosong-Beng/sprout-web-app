import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Download,
  RefreshCw,
  Search,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import { studioFetch } from '../lib/api';
import type { RouteId } from '../nav';
import type { HealthCheckData, PlatformStatus } from '../hooks/usePlatformStatus';
import {
  Badge,
  Button,
  Empty,
  Meter,
  Panel,
  PanelHead,
  Row,
  SpriteFrame,
  Spinner,
  Stat,
  cx,
  type Tone,
} from './ui';

interface AdminDashboardProps {
  route: RouteId;
  platform: PlatformStatus;
}

const ROUTE_DEADLINE_MS = 110_000;

/* -------------------------------------------------------------------------- */
/* Probe definitions — declarative so the six cards share one renderer         */
/* -------------------------------------------------------------------------- */

interface ProbeDef {
  key: string;
  hop: string;
  name: string;
  desc: string;
  accent: Tone;
  rows: (h: HealthCheckData | null) => { label: string; value: React.ReactNode; tone?: Tone; strike?: boolean }[];
  credits?: (h: HealthCheckData | null) => { used: number; remaining: number; limit: number } | null;
}

const PROBES: ProbeDef[] = [
  {
    key: 'plantId',
    hop: 'Hop 0',
    name: 'Plant.id v3',
    desc: 'Species photo identification',
    accent: 'ok',
    rows: () => [],
    // Only shown when the probe actually reported. A diagnostics tool must not
    // present placeholder balances as if they were measured.
    credits: (h) => {
      const p = h?.probes?.plantId;
      if (!p || p.remainingCredits === undefined || p.limit === undefined) return null;
      return { used: p.used ?? p.limit - p.remainingCredits, remaining: p.remainingCredits, limit: p.limit };
    },
  },
  {
    key: 'geminiVision',
    hop: 'Hop 1a',
    name: 'Gemini Vision',
    desc: 'Primary VLM prompt craftsman',
    accent: 'brand',
    rows: () => [
      { label: 'Model', value: 'gemini-3.5-flash-lite', tone: 'brand' },
      { label: 'Thinking tokens', value: '0 (fast path)', tone: 'ok' },
      { label: 'Max tokens', value: '512' },
    ],
  },
  {
    key: 'nvidiaVision',
    hop: 'Hop 1b',
    name: 'NVIDIA Gemma',
    desc: 'Secondary VLM fallback',
    accent: 'warn',
    rows: () => [
      { label: 'Model', value: 'google/gemma-4-31b-it' },
      { label: 'Tail latency', value: '21.2s – 45.0s', tone: 'warn' },
      { label: 'Deprecated', value: 'gemma-3-27b (410)', strike: true },
    ],
  },
  {
    key: 'fluxRender',
    hop: 'Hop 2',
    name: 'NVIDIA Flux.2',
    desc: 'Raw sprite generator (Klein 4B)',
    accent: 'info',
    rows: () => [
      { label: 'Output', value: 'JPEG (ffd8ffe0)', tone: 'info' },
      { label: 'Canvas', value: '1024×1024' },
      { label: 'Steps', value: '4 fast steps' },
    ],
  },
  {
    key: 'withoutBg',
    hop: 'Hop 3',
    name: 'withoutBG',
    desc: 'Foreground RGBA alpha matting',
    accent: 'gate',
    rows: () => [
      { label: 'Cost', value: '1 credit / cutout', tone: 'ok' },
      { label: 'Retries', value: '3 × 400ms backoff' },
      { label: 'Permanent errors', value: '401 402 403 422' },
    ],
  },
  {
    key: 'sharpCleaner',
    hop: 'Hop 4',
    name: 'Sharp cleaner',
    desc: 'Island removal & downscale',
    accent: 'gold',
    rows: () => [
      { label: 'Execution', value: 'Local libsharp', tone: 'gold' },
      { label: 'Target', value: '192×192 PNG' },
      { label: 'Palette', value: 'Florentine24 NN' },
    ],
  },
];

const statusTone = (status?: string): Tone => {
  switch (status) {
    case 'PASS':
      return 'ok';
    case 'WARN':
      return 'warn';
    case 'FAIL':
      return 'danger';
    case 'SKIP':
      return 'neutral';
    default:
      return 'ok';
  }
};

const KEY_DESCRIPTIONS: Record<string, string> = {
  PLANT_API_KEY: 'Plant.id v3 species identification',
  GEMINI_KEY: 'Google AI Studio — primary vision model',
  GEMMA_API_KEY: 'NVIDIA NIM — fallback vision model',
  FLUX_API_KEY: 'NVIDIA — Flux.2 Klein image render',
  NVIDIA_API_KEY: 'Accepted as a fallback for either NVIDIA key',
  WITHOUTBG_KEY: 'withoutBG background cutout',
  DATABASE_URL: 'Postgres connection for Dex persistence',
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ route, platform }) => {
  const {
    config,
    health,
    logs,
    dexEntries,
    loadingHealth,
    loadingLogs,
    loadingDex,
    refreshHealth,
    refreshLogs,
    refreshDex,
  } = platform;

  // Prompt bench
  const [rawPromptInput, setRawPromptInput] = useState<string>(
    `I'm unable to generate an image from this text-based prompt. However, here is the prompt translated into an image generation instruction: Create a chibi-style, 192x192 pixel, pixel-art plant monster sprite with a flat solid white background, using the plant's real colors and defining features as the creature's body parts.`,
  );
  const [cleanedPromptResult, setCleanedPromptResult] = useState<any | null>(null);
  const [testingClean, setTestingClean] = useState(false);

  // Log filters
  const [logSearch, setLogSearch] = useState('');
  const [logFilterLevel, setLogFilterLevel] = useState('all');

  // Dex gate filter
  const [dexFilterStatus, setDexFilterStatus] = useState('all');

  // Budget simulator
  const [simHop1, setSimHop1] = useState(1500);
  const [simHop2, setSimHop2] = useState(2200);
  const [simHop3, setSimHop3] = useState(3100);

  const totalSimMs = simHop1 + simHop2 + simHop3 + 50;
  const remainingBudgetMs = Math.max(0, ROUTE_DEADLINE_MS - totalSimMs);
  const budgetPct = Math.min(100, (totalSimMs / ROUTE_DEADLINE_MS) * 100);
  const budgetTone: Tone =
    totalSimMs > ROUTE_DEADLINE_MS ? 'danger' : budgetPct > 80 ? 'warn' : 'ok';

  const handleTestCleanPrompt = async () => {
    if (!rawPromptInput.trim()) return;
    setTestingClean(true);
    try {
      const res = await studioFetch('/api/platform/clean-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: rawPromptInput }),
      });
      if (res.ok) setCleanedPromptResult(await res.json());
    } catch (err) {
      console.error('Failed to clean prompt:', err);
    } finally {
      setTestingClean(false);
    }
  };

  const handleApproveDex = async (id: string, newStatus: 'APPROVED' | 'REJECTED') => {
    try {
      const res = await studioFetch('/api/platform/dex-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus }),
      });
      if (res.ok) refreshDex();
    } catch (err) {
      console.error('Failed to update Dex status:', err);
    }
  };

  const exportHealthReport = () => {
    const report = { timestamp: new Date().toISOString(), config, health, logs };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plantemon-health-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredLogs = useMemo(
    () =>
      logs.filter((l) => {
        if (logFilterLevel !== 'all' && l.level !== logFilterLevel) return false;
        if (!logSearch) return true;
        const q = logSearch.toLowerCase();
        return (
          l.message.toLowerCase().includes(q) ||
          l.hop.toLowerCase().includes(q) ||
          (l.signature ?? '').toLowerCase().includes(q)
        );
      }),
    [logs, logFilterLevel, logSearch],
  );

  const filteredDex = useMemo(
    () =>
      dexEntries.filter((d) => dexFilterStatus === 'all' || d.status === dexFilterStatus),
    [dexEntries, dexFilterStatus],
  );

  /* ====================================================================== */
  /* API Health                                                              */
  /* ====================================================================== */

  if (route === 'health') {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="System"
            value={health?.overallStatus ?? (loadingHealth ? '···' : 'UNKNOWN')}
            tone={
              !health ? 'neutral' : health.overallStatus === 'DEGRADED' ? 'warn' : 'ok'
            }
          />
          <Stat
            label="Plant.id credits"
            value={health?.probes?.plantId?.remainingCredits ?? '—'}
            sub={
              health?.probes?.plantId?.limit !== undefined
                ? `of ${health.probes.plantId.limit}`
                : 'probe did not report'
            }
            tone={health?.probes?.plantId?.remainingCredits !== undefined ? 'info' : 'neutral'}
          />
          <Stat
            label="Primary vision"
            value={
              <span className="truncate text-meta">
                {config?.models?.primaryVision || 'gemini-3.5-flash-lite'}
              </span>
            }
            tone="brand"
          />
          <Stat label="Route deadline" value="110.0s" sub="function limit 120s" tone="gold" />
        </div>

        <div className="flex justify-end gap-2">
          <Button
            onClick={refreshHealth}
            disabled={loadingHealth}
            icon={<RefreshCw className={cx('h-3.5 w-3.5', loadingHealth && 'animate-spin')} />}
          >
            Run diagnostic pass
          </Button>
          <Button variant="primary" onClick={exportHealthReport} icon={<Download className="h-3.5 w-3.5" />}>
            Export JSON
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {PROBES.map((probe) => {
            const p = health?.probes?.[probe.key];
            const credits = probe.credits?.(health) ?? null;
            const rows = probe.rows(health);

            return (
              <Panel key={probe.key}>
                <PanelHead
                  kicker={probe.hop}
                  title={probe.name}
                  sub={probe.desc}
                  right={
                    <Badge tone={statusTone(p?.status)} dot>
                      {p?.status ?? 'PASS'}
                    </Badge>
                  }
                />

                <div className="space-y-3 p-4">
                  {credits && (
                    <div className="space-y-2 rounded-card border border-line-soft bg-raised p-3">
                      <div className="flex items-baseline justify-between">
                        <span className="text-label text-txt-4">Remaining credits</span>
                        <span className="font-mono text-title font-bold text-ok">
                          {credits.remaining}
                        </span>
                      </div>
                      <Meter pct={(credits.remaining / credits.limit) * 100} tone="ok" />
                      <div className="flex justify-between font-mono text-[10px] text-txt-5">
                        <span>used {credits.used}</span>
                        <span>limit {credits.limit}</span>
                      </div>
                    </div>
                  )}

                  {rows.length > 0 && (
                    <div className="space-y-1.5 rounded-card border border-line-soft bg-raised p-3">
                      {rows.map((r) => (
                        <Row
                          key={r.label}
                          label={r.label}
                          value={r.value}
                          tone={r.tone}
                          strike={r.strike}
                        />
                      ))}
                    </div>
                  )}

                  <Row
                    label="Measured latency"
                    value={p?.latencyMs !== undefined ? `${p.latencyMs}ms` : 'not measured'}
                    tone={p?.latencyMs !== undefined ? 'info' : 'neutral'}
                  />
                  {p?.detail && <p className="text-label text-txt-4">{p.detail}</p>}
                </div>
              </Panel>
            );
          })}
        </div>
      </div>
    );
  }

  /* ====================================================================== */
  /* Keys & Secrets                                                          */
  /* ====================================================================== */

  if (route === 'keys') {
    const entries = config ? Object.entries(config.keys) : [];

    return (
      <Panel className="overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-line bg-raised px-4 py-2.5">
          <span className="pixel-label text-txt-4">Variable</span>
          <span className="pixel-label text-txt-4">Status</span>
          <span className="pixel-label w-32 text-right text-txt-4">Preview</span>
        </div>

        {entries.length === 0 ? (
          <div className="p-4">
            <Empty
              icon={<Spinner className="h-6 w-6" />}
              title="Reading server environment…"
              sub="If this persists, /api/admin/config-status is unreachable."
            />
          </div>
        ) : (
          <div className="divide-y divide-line-soft">
            {entries.map(([keyName, raw]) => {
              const info = raw as { configured: boolean; preview: string | null };
              return (
                <div
                  key={keyName}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-3 transition-colors hover:bg-raised/60"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-meta font-semibold text-txt">{keyName}</div>
                    <p className="mt-0.5 truncate text-label text-txt-4">
                      {KEY_DESCRIPTIONS[keyName] ?? 'Server environment variable'}
                    </p>
                  </div>

                  <Badge tone={info.configured ? 'ok' : 'danger'}>
                    {info.configured ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    {info.configured ? 'Active' : 'Missing'}
                  </Badge>

                  <span className="w-32 truncate rounded-chip border border-line bg-void px-2 py-1 text-right font-mono text-[10px] text-txt-3">
                    {info.preview || '—'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    );
  }

  /* ====================================================================== */
  /* Topology & Budgets                                                      */
  /* ====================================================================== */

  if (route === 'topology') {
    const sliders = [
      { label: 'Hop 1 — Prompt craft', value: simHop1, set: setSimHop1, max: 75000, tone: 'brand' as Tone },
      { label: 'Hop 2 — Flux render', value: simHop2, set: setSimHop2, max: 30000, tone: 'info' as Tone },
      { label: 'Hop 3 — withoutBG', value: simHop3, set: setSimHop3, max: 15000, tone: 'gate' as Tone },
    ];

    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Panel className="lg:col-span-7">
          <PanelHead
            kicker="Simulator"
            title="Per-hop latency"
            sub="Drag to model a slow provider and see which optional stages get shed."
          />
          <div className="space-y-5 p-4">
            {sliders.map((s) => (
              <div key={s.label}>
                <div className="mb-2 flex items-baseline justify-between">
                  <label className="text-meta text-txt-2">{s.label}</label>
                  <span className="font-mono text-body font-bold text-txt">
                    {(s.value / 1000).toFixed(1)}s
                  </span>
                </div>
                <input
                  type="range"
                  min={500}
                  max={s.max}
                  step={500}
                  value={s.value}
                  onChange={(e) => s.set(Number(e.target.value))}
                  aria-label={s.label}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-void accent-brand"
                />
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="lg:col-span-5">
          <PanelHead
            kicker="Budget"
            title="Route deadline"
            right={<Badge tone="gold" mono>110.0s cap</Badge>}
          />
          <div className="space-y-4 p-4">
            <div>
              <div className="mb-2 flex items-baseline justify-between font-mono text-meta">
                <span className="text-txt-4">Total elapsed</span>
                <span
                  className={cx(
                    'text-title font-bold',
                    budgetTone === 'danger'
                      ? 'text-danger'
                      : budgetTone === 'warn'
                        ? 'text-warn'
                        : 'text-ok',
                  )}
                >
                  {(totalSimMs / 1000).toFixed(2)}s
                </span>
              </div>
              <Meter pct={budgetPct} tone={budgetTone} height="h-2.5" />
              <div className="mt-1.5 flex justify-between font-mono text-[10px] text-txt-5">
                <span>{budgetPct.toFixed(0)}% consumed</span>
                <span>{(remainingBudgetMs / 1000).toFixed(1)}s remaining</span>
              </div>
            </div>

            {remainingBudgetMs < 8000 ? (
              <div className="flex items-start gap-2.5 rounded-card border border-warn/30 bg-warn/10 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                <p className="text-meta text-txt-2">
                  <strong className="text-warn">Under 8s remaining.</strong> Hop 3 (withoutBG
                  cutout) will be skipped automatically to avoid a 504 at the gateway.
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-2.5 rounded-card border border-ok/30 bg-ok/10 p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
                <p className="text-meta text-txt-2">
                  All hops fit inside the deadline. No feature shedding required.
                </p>
              </div>
            )}

            <div className="space-y-1.5 rounded-card border border-line-soft bg-raised p-3">
              <Row label="Sharp cleanup" value="~50ms" />
              <Row label="Function limit" value="120.0s" tone="info" />
              <Row label="Safety margin" value="10.0s" tone="gold" />
            </div>
          </div>
        </Panel>
      </div>
    );
  }

  /* ====================================================================== */
  /* Logs                                                                    */
  /* ====================================================================== */

  if (route === 'logs') {
    return (
      <Panel>
        <PanelHead
          kicker="Stream"
          title={`${filteredLogs.length} event${filteredLogs.length === 1 ? '' : 's'}`}
          right={
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-txt-5" />
                <input
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="Filter…"
                  aria-label="Filter logs"
                  className="w-36 rounded-card border border-line bg-void py-1.5 pr-2 pl-8 font-mono text-meta text-txt placeholder:text-txt-5 focus:border-brand/50 focus:outline-none"
                />
              </div>
              <select
                value={logFilterLevel}
                onChange={(e) => setLogFilterLevel(e.target.value)}
                aria-label="Filter by level"
                className="rounded-card border border-line bg-void px-2 py-1.5 text-meta text-txt-2 focus:border-brand/50 focus:outline-none"
              >
                <option value="all">All levels</option>
                <option value="info">Info</option>
                <option value="warn">Warn</option>
                <option value="error">Error</option>
              </select>
              <Button
                size="sm"
                onClick={refreshLogs}
                aria-label="Refresh logs"
                icon={<RefreshCw className={cx('h-3.5 w-3.5', loadingLogs && 'animate-spin')} />}
              />
            </>
          }
        />

        {filteredLogs.length === 0 ? (
          <div className="p-4">
            <Empty
              icon={<Search className="h-8 w-8" />}
              title={logs.length === 0 ? 'No events recorded' : 'No events match the filter'}
              sub={
                logs.length === 0
                  ? 'The in-memory buffer fills as the pipeline runs.'
                  : 'Try a broader search term or level.'
              }
            />
          </div>
        ) : (
          <div className="max-h-[600px] divide-y divide-line-soft overflow-y-auto">
            {filteredLogs.map((log, idx) => {
              const tone: Tone =
                log.level === 'error' ? 'danger' : log.level === 'warn' ? 'warn' : 'ok';
              return (
                <div key={idx} className="px-4 py-2.5 transition-colors hover:bg-raised/60">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] text-txt-5">{log.timestamp}</span>
                    <Badge tone={tone} dot>
                      {log.level.toUpperCase()}
                    </Badge>
                    <Badge tone="neutral" mono>
                      {log.hop}
                    </Badge>
                    {log.latencyMs !== undefined && (
                      <span className="font-mono text-[10px] text-info">{log.latencyMs}ms</span>
                    )}
                  </div>
                  <p className="mt-1.5 font-mono text-meta text-txt-2">{log.message}</p>
                  {log.signature && (
                    <span className="mt-1.5 inline-block rounded-chip border border-gold/25 bg-gold/10 px-2 py-0.5 font-mono text-[10px] text-gold">
                      {log.signature}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    );
  }

  /* ====================================================================== */
  /* Dex approval gate                                                       */
  /* ====================================================================== */

  if (route === 'gate') {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1.5">
            {['all', 'PENDING', 'APPROVED', 'REJECTED'].map((s) => (
              <button
                key={s}
                onClick={() => setDexFilterStatus(s)}
                className={cx(
                  'rounded-card border px-2.5 py-1.5 text-label font-semibold transition-colors',
                  dexFilterStatus === s
                    ? 'border-brand/40 bg-brand/10 text-brand'
                    : 'border-line bg-raised text-txt-3 hover:text-txt',
                )}
              >
                {s === 'all' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          <Button
            onClick={refreshDex}
            icon={<RefreshCw className={cx('h-3.5 w-3.5', loadingDex && 'animate-spin')} />}
          >
            Refresh
          </Button>
        </div>

        {filteredDex.length === 0 ? (
          <Empty
            icon={<Sparkles className="h-10 w-10" />}
            title="Nothing awaiting review"
            sub="Generated species that fall below the auto-approve threshold queue up here."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredDex.map((entry) => (
              <Panel key={entry.id}>
                <PanelHead
                  kicker={entry.dimensions || '192×192'}
                  title={entry.species}
                  sub={entry.commonName}
                  right={
                    <Badge
                      tone={
                        entry.status === 'APPROVED'
                          ? 'ok'
                          : entry.status === 'REJECTED'
                            ? 'danger'
                            : 'gate'
                      }
                      dot
                    >
                      {entry.status}
                    </Badge>
                  }
                />

                <div className="flex gap-3 p-4">
                  <SpriteFrame src={entry.spriteUrl} alt={entry.species} size="md" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Row
                      label="Judge"
                      value={`${entry.cuteScore}/5`}
                      tone={entry.cuteScore >= 4 ? 'ok' : 'warn'}
                    />
                    <Row label="Palette" value={entry.paletteMatch} tone="info" />
                    <Row label="Dimensions" value={entry.dimensions} />
                  </div>
                </div>

                {entry.craftedPrompt && (
                  <p className="mx-4 mb-3 line-clamp-3 rounded-card border border-line-soft bg-void p-2.5 font-mono text-[11px] text-txt-3">
                    {entry.craftedPrompt}
                  </p>
                )}

                <div className="flex gap-2 border-t border-line-soft p-3">
                  {entry.status !== 'APPROVED' && (
                    <Button
                      variant="primary"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleApproveDex(entry.id, 'APPROVED')}
                      icon={<Check className="h-3.5 w-3.5" />}
                    >
                      Approve
                    </Button>
                  )}
                  {entry.status !== 'REJECTED' && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleApproveDex(entry.id, 'REJECTED')}
                      icon={<X className="h-3.5 w-3.5" />}
                    >
                      Reject
                    </Button>
                  )}
                </div>
              </Panel>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ====================================================================== */
  /* Prompt cleaner bench                                                    */
  /* ====================================================================== */

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel>
        <PanelHead kicker="Input" title="Raw VLM output" />
        <div className="space-y-3 p-4">
          <textarea
            value={rawPromptInput}
            onChange={(e) => setRawPromptInput(e.target.value)}
            rows={10}
            aria-label="Raw VLM output"
            placeholder="Paste raw Gemma/Gemini output…"
            className="w-full resize-y rounded-card border border-line bg-void p-3 font-mono text-meta leading-relaxed text-txt placeholder:text-txt-5 focus:border-brand/50 focus:outline-none"
          />
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-txt-5">
              {rawPromptInput.length} chars
            </span>
            <Button
              variant="primary"
              onClick={handleTestCleanPrompt}
              disabled={testingClean || !rawPromptInput.trim()}
              icon={
                testingClean ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )
              }
            >
              {testingClean ? 'Cleaning…' : 'Run cleaner'}
            </Button>
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHead
          kicker="Output"
          title="Cleaned prompt"
          right={
            cleanedPromptResult && (
              <Badge tone="ok" mono>
                −{cleanedPromptResult.characterDiff ?? 0} chars
              </Badge>
            )
          }
        />
        <div className="p-4">
          {cleanedPromptResult ? (
            <p className="rounded-card border border-ok/25 bg-void p-3 font-mono text-meta leading-relaxed text-txt-2 select-all">
              {cleanedPromptResult.cleanedText}
            </p>
          ) : (
            <Empty
              icon={<Sparkles className="h-8 w-8" />}
              title="No result yet"
              sub="Run the cleaner to strip conversational preambles, refusals and markdown headers."
            />
          )}
        </div>
      </Panel>
    </div>
  );
};
