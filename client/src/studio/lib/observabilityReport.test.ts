import { describe, it, expect } from 'vitest';
import { buildObservabilityReportHtml, type ObservabilityReport } from './observabilityReport';

const api = (over: Partial<ObservabilityReport['current']['metrics']['apis'][number]> = {}) => ({
  api: 'Plant.id',
  requests: 10,
  errors: 2,
  avgMs: 1200,
  p50Ms: 1100,
  p95Ms: 3400,
  maxMs: 5000,
  ...over,
});

const report = (over: Partial<ObservabilityReport> = {}): ObservabilityReport => ({
  generatedAt: '2026-08-10T04:05:06.789Z',
  current: { id: 'run-1', startedAt: '2026-08-10T00:00:00.000Z', metrics: { apis: [api()] } },
  previousRuns: [],
  ...over,
});

describe('buildObservabilityReportHtml', () => {
  it('renders a per-API row with the latency stats', () => {
    const html = buildObservabilityReportHtml(report({
      current: {
        id: 'r',
        startedAt: '2026-08-10T00:00:00.000Z',
        metrics: { apis: [api({ maxMs: 12000 })] },
      },
    }));
    expect(html).toContain('Plant.id');
    expect(html).toContain('3400ms'); // p95, under the 10s threshold -> ms
    expect(html).toContain('12.0s'); // max over the 10s threshold -> seconds
    expect(html).toContain('API Observability Report');
  });

  it('shows the totals across APIs', () => {
    const html = buildObservabilityReportHtml(
      report({
        current: {
          id: 'r',
          startedAt: '2026-08-10T00:00:00.000Z',
          metrics: { apis: [api({ api: 'Flux', requests: 5, errors: 1 }), api({ api: 'withoutBG', requests: 3, errors: 0 })] },
        },
      })
    );
    expect(html).toContain('>8<'); // total requests 5+3
    expect(html).toContain('>1<'); // total errors 1+0
  });

  it('escapes API names so a crafted name cannot inject markup', () => {
    const html = buildObservabilityReportHtml(
      report({
        current: {
          id: 'r',
          startedAt: '2026-08-10T00:00:00.000Z',
          metrics: { apis: [api({ api: '<script>x</script>' })] },
        },
      })
    );
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('handles a run with no API calls', () => {
    const html = buildObservabilityReportHtml(
      report({ current: { id: 'r', startedAt: '2026-08-10T00:00:00.000Z', metrics: { apis: [] } } })
    );
    expect(html).toContain('No API calls recorded');
  });

  it('summarises previous runs and flags an unclean shutdown', () => {
    const html = buildObservabilityReportHtml(
      report({
        previousRuns: [
          { id: 'run-0', startedAt: '2026-08-09T00:00:00.000Z', endedAt: null, metrics: { apis: [api({ api: 'Gemini (judge)' })] } },
        ],
      })
    );
    expect(html).toContain('Previous runs (1)');
    expect(html).toContain('Gemini (judge)');
    expect(html).toContain('ended without a clean shutdown');
  });
});
