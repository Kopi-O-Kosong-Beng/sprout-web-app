/**
 * Builds a print-ready HTML document from the observability report and prints
 * it, so the browser's "Save as PDF" produces a shareable file. This is a
 * deliberate zero-dependency choice over a PDF library: the browser already
 * renders HTML/CSS to PDF at high quality, and a printed report of the metrics
 * table needs nothing more. The raw per-call logs are intentionally omitted —
 * they belong in the JSON export; this is the human-readable digest.
 */

interface ApiMetrics {
  api: string;
  requests: number;
  errors: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

interface RunLike {
  id: string;
  startedAt: string;
  endedAt?: string | null;
  metrics: { apis: ApiMetrics[] };
}

export interface ObservabilityReport {
  generatedAt: string;
  current: { id: string; startedAt: string; metrics: { apis: ApiMetrics[] } };
  previousRuns: RunLike[];
}

const fmtMs = (ms: number): string =>
  ms >= 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) =>
    ch === '&' ? '&amp;'
      : ch === '<' ? '&lt;'
        : ch === '>' ? '&gt;'
          : ch === '"' ? '&quot;'
            : '&#39;'
  );

const fmtTime = (iso: string): string => {
  // No Date parsing needed for correctness; keep the ISO but drop the ms/zone
  // noise for readability. Falls back to the raw value if it is not ISO-ish.
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  return match ? `${match[1]} ${match[2]} UTC` : iso;
};

function metricsTable(apis: ApiMetrics[]): string {
  if (apis.length === 0) {
    return '<p class="empty">No API calls recorded in this run.</p>';
  }
  // Slowest first by p95 — the order the observability page uses.
  const rows = [...apis]
    .sort((a, b) => b.p95Ms - a.p95Ms)
    .map(
      (a) => `
      <tr>
        <td class="api">${escapeHtml(a.api)}</td>
        <td class="num">${a.requests}</td>
        <td class="num ${a.errors > 0 ? 'bad' : ''}">${a.errors}</td>
        <td class="num">${fmtMs(a.avgMs)}</td>
        <td class="num">${fmtMs(a.p50Ms)}</td>
        <td class="num strong">${fmtMs(a.p95Ms)}</td>
        <td class="num">${fmtMs(a.maxMs)}</td>
      </tr>`
    )
    .join('');
  return `
    <table>
      <thead>
        <tr>
          <th>API</th><th class="num">Requests</th><th class="num">Failed</th>
          <th class="num">Avg</th><th class="num">p50</th>
          <th class="num">p95</th><th class="num">Max</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function previousRunsSection(runs: RunLike[]): string {
  if (runs.length === 0) return '';
  const rows = runs
    .map((run) => {
      const worst = [...run.metrics.apis].sort((a, b) => b.p95Ms - a.p95Ms)[0];
      return `
      <tr>
        <td>${fmtTime(run.startedAt)}</td>
        <td>${run.endedAt ? fmtTime(run.endedAt) : '<em>ended without a clean shutdown</em>'}</td>
        <td class="num">${run.metrics.apis.length}</td>
        <td>${worst ? `${escapeHtml(worst.api)} @ ${fmtMs(worst.p95Ms)}` : '—'}</td>
      </tr>`;
    })
    .join('');
  return `
    <h2>Previous runs (${runs.length})</h2>
    <p class="note">Each server run keeps its own report; these survive redeploys. Per-call logs are in the JSON export.</p>
    <table>
      <thead>
        <tr><th>Started</th><th>Ended</th><th class="num">APIs</th><th>Slowest (p95)</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

export function buildObservabilityReportHtml(report: ObservabilityReport): string {
  const apis = report.current.metrics.apis;
  const totalRequests = apis.reduce((sum, a) => sum + a.requests, 0);
  const totalErrors = apis.reduce((sum, a) => sum + a.errors, 0);
  const slowest = [...apis].sort((a, b) => b.p95Ms - a.p95Ms)[0];

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Sprout — API Observability Report</title>
<style>
  * { box-sizing: border-box; }
  body { font: 12px/1.5 -apple-system, Segoe UI, Roboto, sans-serif; color: #14121f; margin: 32px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  h2 { font-size: 14px; margin: 24px 0 6px; }
  .sub { color: #6b6880; margin: 0 0 16px; }
  .cards { display: flex; gap: 12px; margin: 12px 0 20px; }
  .card { border: 1px solid #ddd; border-radius: 8px; padding: 10px 14px; flex: 1; }
  .card .k { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #6b6880; }
  .card .v { font-size: 18px; font-weight: 700; margin-top: 2px; }
  table { border-collapse: collapse; width: 100%; margin-top: 4px; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #eee; }
  th.num, td.num { text-align: right; }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #6b6880; border-bottom: 1px solid #ccc; }
  td.api { font-weight: 600; }
  td.strong { font-weight: 700; }
  td.bad { color: #c0203a; font-weight: 700; }
  .note, .empty { color: #6b6880; }
  .empty { padding: 8px 0; }
  footer { margin-top: 28px; color: #9a97ab; font-size: 10px; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
  <h1>API Observability Report</h1>
  <p class="sub">Generated ${fmtTime(report.generatedAt)} · current run started ${fmtTime(report.current.startedAt)}</p>

  <div class="cards">
    <div class="card"><div class="k">API calls</div><div class="v">${totalRequests}</div></div>
    <div class="card"><div class="k">Failed / degraded</div><div class="v">${totalErrors}</div></div>
    <div class="card"><div class="k">Slowest (p95)</div><div class="v">${slowest ? fmtMs(slowest.p95Ms) : '—'}</div></div>
    <div class="card"><div class="k">APIs tracked</div><div class="v">${apis.length}</div></div>
  </div>

  <h2>Current run — per-API latency</h2>
  ${metricsTable(apis)}

  ${previousRunsSection(report.previousRuns)}

  <footer>Sprout studio · in-memory metrics, fed by real scans only.</footer>
</body>
</html>`;
}

/**
 * Renders the report HTML in a hidden iframe and opens the print dialog.
 * An iframe rather than a popup so it is not blocked, and it is removed once
 * printing settles. No-op outside a browser (guards the document access).
 */
export function printReportHtml(html: string): void {
  if (typeof document === 'undefined') return;
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const done = () => iframe.remove();
  const win = iframe.contentWindow;
  if (win) {
    win.onafterprint = done;
    win.focus();
    win.print();
    // Fallback cleanup in case onafterprint never fires (some browsers).
    setTimeout(done, 60_000);
  } else {
    done();
  }
}
