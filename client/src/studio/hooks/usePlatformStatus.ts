import { useCallback, useEffect, useState } from 'react';
import { studioFetch } from '../lib/api';

/**
 * Admin telemetry, lifted out of AdminDashboard so the top bar can show live
 * system health without issuing a second set of probe requests.
 */

export interface ConfigStatus {
  uptimeSeconds: number;
  environment: string;
  models: {
    primaryVision: string;
    fallbackVision: string;
    fluxImageGen: string;
  };
  keys: Record<string, { configured: boolean; preview: string | null }>;
  budgets: Record<string, number>;
}

export interface ProbeResult {
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
  /** null when the provider was not probed — see adminRoutes' health-check. */
  latencyMs?: number | null;
  remainingCredits?: number | null;
  limit?: number | null;
  used?: number | null;
  detail: string;
  model?: string;
}

export interface HealthCheckData {
  timestamp: string;
  overallStatus: 'HEALTHY' | 'DEGRADED';
  probes: Record<string, ProbeResult>;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  hop: string;
  message: string;
  signature?: string;
  latencyMs?: number;
}

/** One render of a species — see server/models/dexCandidate.ts. */
export interface DexCandidateEntry {
  id: string;
  speciesKey: string;
  speciesName: string;
  version: number;
  spriteUrl: string;
  status: 'PENDING' | 'PUBLISHED' | 'REJECTED';
  scannedBy: string;
  createdAt: string;
  evaluation: {
    autoApproved: boolean | null;
    judgeCute: number | null;
    removeBgOk: boolean | null;
    paletteValid: boolean | null;
    dimsOk: boolean | null;
    notBlank: boolean | null;
    confidence: number | null;
  } | null;
}

/** A real dex species with every render the pipeline has kept for it. */
export interface DexSpeciesEntry {
  speciesKey: string;
  speciesName: string;
  discoveryCount: number;
  firstDiscoveredAt: string;
  /** The global reference — what the almanac shows. */
  spriteUrl: string;
  candidates: DexCandidateEntry[];
}

export interface ApiCallSample {
  at: number;
  latencyMs: number;
  ok: boolean;
}

export interface ApiMetrics {
  api: string;
  requests: number;
  errors: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  lastMs: number | null;
  lastAt: number | null;
  recent: ApiCallSample[];
}

export interface MetricsSnapshot {
  timestamp: string;
  /** Slowest-first by p95. */
  apis: ApiMetrics[];
}

export interface PlatformStatus {
  config: ConfigStatus | null;
  health: HealthCheckData | null;
  logs: LogEntry[];
  dexSpecies: DexSpeciesEntry[];
  metrics: MetricsSnapshot | null;
  loadingConfig: boolean;
  loadingHealth: boolean;
  loadingLogs: boolean;
  loadingDex: boolean;
  loadingMetrics: boolean;
  refreshConfig: () => void;
  refreshHealth: () => void;
  refreshLogs: () => void;
  refreshDex: () => void;
  refreshMetrics: () => void;
  refreshAll: () => void;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await studioFetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (err) {
    console.error(`Request failed: ${url}`, err);
    return null;
  }
}

export function usePlatformStatus(): PlatformStatus {
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [health, setHealth] = useState<HealthCheckData | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [dexSpecies, setDexSpecies] = useState<DexSpeciesEntry[]>([]);
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [loadingDex, setLoadingDex] = useState(true);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  const refreshConfig = useCallback(async () => {
    setLoadingConfig(true);
    const data = await getJson<ConfigStatus>('/api/platform/config-status');
    if (data) setConfig(data);
    setLoadingConfig(false);
  }, []);

  const refreshHealth = useCallback(async () => {
    setLoadingHealth(true);
    const data = await getJson<HealthCheckData>('/api/platform/health-check');
    if (data) setHealth(data);
    setLoadingHealth(false);
  }, []);

  const refreshLogs = useCallback(async () => {
    setLoadingLogs(true);
    const data = await getJson<{ logs?: LogEntry[] }>('/api/platform/logs');
    setLogs(data?.logs ?? []);
    setLoadingLogs(false);
  }, []);

  const refreshDex = useCallback(async () => {
    setLoadingDex(true);
    const data = await getJson<{ species?: DexSpeciesEntry[] }>('/api/platform/dex-docs');
    setDexSpecies(data?.species ?? []);
    setLoadingDex(false);
  }, []);

  const refreshMetrics = useCallback(async () => {
    setLoadingMetrics(true);
    const data = await getJson<MetricsSnapshot>('/api/platform/metrics');
    if (data) setMetrics(data);
    setLoadingMetrics(false);
  }, []);

  const refreshAll = useCallback(() => {
    refreshConfig();
    refreshHealth();
    refreshLogs();
    refreshDex();
    refreshMetrics();
  }, [refreshConfig, refreshHealth, refreshLogs, refreshDex, refreshMetrics]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  return {
    config,
    health,
    logs,
    dexSpecies,
    metrics,
    loadingConfig,
    loadingHealth,
    loadingLogs,
    loadingDex,
    loadingMetrics,
    refreshConfig,
    refreshHealth,
    refreshLogs,
    refreshDex,
    refreshMetrics,
    refreshAll,
  };
}
