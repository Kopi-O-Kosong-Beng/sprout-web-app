import React from 'react';
import { LogIn, LogOut, X } from 'lucide-react';
import { logoutUser, signInWithGoogle, type User } from '../lib/firebase';
import markBlack from '../assets/brand/mark-black.png';
import wordmarkLight from '../assets/brand/wordmark-light.png';
import { NAV, type RouteId } from '../nav';
import { Badge, Spinner, cx } from './ui';

interface SidebarProps {
  route: RouteId;
  onNavigate: (r: RouteId) => void;
  user: User | null;
  loadingAuth: boolean;
  projectId: string;
  /** Mobile drawer state — the rail is always visible from lg upward. */
  open: boolean;
  onClose: () => void;
  dexCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  route,
  onNavigate,
  user,
  loadingAuth,
  projectId,
  open,
  onClose,
  dexCount,
}) => {
  const counts: Partial<Record<RouteId, number>> = {
    dex: dexCount,
  };

  return (
    <>
      {/* Mobile scrim */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-void/80 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        id="app-sidebar"
        className={cx(
          'fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r border-line bg-base',
          'transition-transform duration-200 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* ---- Brand ------------------------------------------------------ */}
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            {/* Dark mark on a lime tile — same lockup as the favicon. */}
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card bg-brand p-1.5 shadow-pixel-brand">
              <img src={markBlack} alt="" className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0">
              <img src={wordmarkLight} alt="Sprout" className="h-6 w-auto" />
              <div className="mt-1 truncate font-mono text-[10px] text-txt-4">{projectId}</div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-card p-1.5 text-txt-4 hover:bg-raised hover:text-txt lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ---- Nav groups ------------------------------------------------- */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-4" aria-label="Main">
          {NAV.map((group) => (
            <div key={group.label} className="mb-5 last:mb-0">
              <div className="pixel-label mb-2 px-2 text-txt-5">{group.label}</div>

              <ul className="space-y-0.5">
                {group.routes.map((r) => {
                  const active = route === r.id;
                  const Icon = r.icon;
                  const count = counts[r.id];

                  return (
                    <li key={r.id}>
                      <button
                        onClick={() => onNavigate(r.id)}
                        aria-current={active ? 'page' : undefined}
                        className={cx(
                          'group relative flex w-full items-center gap-2.5 rounded-card px-2.5 py-2 text-meta font-medium transition-colors',
                          active
                            ? 'bg-brand/12 text-brand'
                            : 'text-txt-3 hover:bg-raised hover:text-txt',
                        )}
                      >
                        {/* Active marker — a solid bar, not a colour-only cue */}
                        <span
                          className={cx(
                            'absolute top-1/2 -left-2.5 h-5 w-[3px] -translate-y-1/2 rounded-r-full transition-all',
                            active ? 'bg-brand' : 'bg-transparent',
                          )}
                          aria-hidden="true"
                        />
                        <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2.4 : 2} />
                        <span className="flex-1 truncate text-left">{r.label}</span>
                        {count !== undefined && count > 0 && (
                          <span
                            className={cx(
                              'rounded-chip px-1.5 py-px font-mono text-[10px] font-semibold',
                              active ? 'bg-brand/20 text-brand' : 'bg-raised text-txt-4',
                            )}
                          >
                            {count}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* ---- Account ---------------------------------------------------- */}
        <div className="shrink-0 border-t border-line p-2.5">
          {loadingAuth ? (
            <div className="flex items-center gap-2 px-2 py-2 text-meta text-txt-4">
              <Spinner className="h-3.5 w-3.5" />
              <span>Verifying session…</span>
            </div>
          ) : user ? (
            <div className="flex items-center gap-2.5 rounded-card p-1.5 pr-1">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-8 w-8 shrink-0 rounded-card border border-line object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-card bg-f24-indigo font-mono text-meta font-bold text-txt">
                  {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="truncate text-meta font-medium text-txt-2">
                  {user.displayName || 'Firebase User'}
                </div>
                <div className="truncate font-mono text-[10px] text-txt-4">{user.email}</div>
              </div>

              <button
                onClick={() => logoutUser()}
                title="Sign out"
                aria-label="Sign out"
                className="rounded-card p-2 text-txt-4 transition-colors hover:bg-raised hover:text-danger"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <Badge tone="warn" dot className="w-full justify-center">
                Guest session
              </Badge>
              <button
                onClick={() => signInWithGoogle()}
                className="flex w-full items-center justify-center gap-2 rounded-card bg-brand px-3 py-2 text-meta font-semibold text-base transition-colors hover:bg-brand-hi"
              >
                <LogIn className="h-3.5 w-3.5" />
                Sign in with Google
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
