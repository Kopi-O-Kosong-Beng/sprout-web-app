import React from 'react';
import { AlertTriangle, CheckCircle2, Database, Menu, RefreshCw, Server } from 'lucide-react';
import { ROUTES, type RouteId } from '../nav';
import { Badge, Spinner, cx } from './ui';
import type { HealthCheckData } from '../hooks/usePlatformStatus';

interface TopbarProps {
  route: RouteId;
  onMenu: () => void;
  projectId: string;
  databaseId: string;
  health: HealthCheckData | null;
  loadingHealth: boolean;
  onRefresh: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  route,
  onMenu,
  projectId,
  databaseId,
  health,
  loadingHealth,
  onRefresh,
}) => {
  const def = ROUTES[route];
  const healthy = health?.overallStatus !== 'DEGRADED';

  return (
    <header
      id="app-topbar"
      className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-base/85 px-4 backdrop-blur-md sm:px-6"
    >
      {/* Left: mobile nav + breadcrumb */}
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={onMenu}
          className="rounded-card p-2 text-txt-3 hover:bg-raised hover:text-txt lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-4.5 w-4.5" />
        </button>

        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-meta">
          <span className="hidden text-txt-4 sm:inline">{def.kicker}</span>
          <span className="hidden text-txt-5 sm:inline">/</span>
          <span className="truncate font-semibold text-txt">{def.title}</span>
        </nav>
      </div>

      {/* Right: environment + system status */}
      <div className="flex shrink-0 items-center gap-2">
        <span className="hidden items-center gap-1.5 rounded-chip border border-line bg-panel px-2 py-1 font-mono text-[10px] text-txt-3 xl:inline-flex">
          <Server className="h-3 w-3 text-brand" />
          {projectId}
        </span>

        <span className="hidden items-center gap-1.5 rounded-chip border border-line bg-panel px-2 py-1 font-mono text-[10px] text-txt-3 xl:inline-flex">
          <Database className="h-3 w-3 text-info" />
          {databaseId}
        </span>

        {loadingHealth ? (
          <span className="inline-flex items-center gap-1.5 rounded-chip border border-line bg-panel px-2 py-1 text-label text-txt-4">
            <Spinner className="h-3 w-3" />
            <span className="hidden sm:inline">Probing</span>
          </span>
        ) : (
          <Badge tone={healthy ? 'ok' : 'warn'}>
            {healthy ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <AlertTriangle className="h-3 w-3" />
            )}
            <span className="hidden sm:inline">{healthy ? 'Healthy' : 'Degraded'}</span>
          </Badge>
        )}

        <button
          onClick={onRefresh}
          title="Re-run diagnostic probes"
          aria-label="Re-run diagnostic probes"
          className="rounded-card border border-line bg-panel p-2 text-txt-3 transition-colors hover:border-line-strong hover:text-txt"
        >
          <RefreshCw className={cx('h-3.5 w-3.5', loadingHealth && 'animate-spin text-brand')} />
        </button>
      </div>
    </header>
  );
};
