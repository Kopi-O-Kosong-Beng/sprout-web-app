import React from 'react';

/* ============================================================================
   Shared primitives.

   Before this existed, `bg-slate-900 border border-slate-800 rounded-2xl p-5`
   was hand-written 30+ times and drifted at every site. Elevation, status
   colour and type scale now have exactly one definition each.
   ========================================================================== */

export type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' | 'gate' | 'info' | 'gold';

/** Border / text / faint-fill triplet per semantic tone. */
export const TONE: Record<Tone, { text: string; border: string; fill: string; dot: string }> = {
  neutral: { text: 'text-txt-3', border: 'border-line', fill: 'bg-raised', dot: 'bg-txt-4' },
  brand: { text: 'text-brand', border: 'border-brand/30', fill: 'bg-brand/10', dot: 'bg-brand' },
  ok: { text: 'text-ok', border: 'border-ok/30', fill: 'bg-ok/10', dot: 'bg-ok' },
  warn: { text: 'text-warn', border: 'border-warn/30', fill: 'bg-warn/10', dot: 'bg-warn' },
  danger: { text: 'text-danger', border: 'border-danger/30', fill: 'bg-danger/10', dot: 'bg-danger' },
  gate: { text: 'text-gate', border: 'border-gate/30', fill: 'bg-gate/10', dot: 'bg-gate' },
  info: { text: 'text-info', border: 'border-info/30', fill: 'bg-info/10', dot: 'bg-info' },
  gold: { text: 'text-gold', border: 'border-gold/30', fill: 'bg-gold/10', dot: 'bg-gold' },
};

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Elevation tiers, so nesting reads as depth instead of a flat wall of cards:
 *   panel   — the default container sitting on the page
 *   raised  — a block nested inside a panel
 *   flush   — borderless grouping, no fill
 */
export const Panel: React.FC<{
  children: React.ReactNode;
  level?: 'panel' | 'raised' | 'flush';
  className?: string;
  id?: string;
}> = ({ children, level = 'panel', className, id }) => (
  <div
    id={id}
    className={cx(
      'rounded-pane',
      level === 'panel' && 'bg-panel border border-line',
      level === 'raised' && 'bg-raised border border-line-soft',
      level === 'flush' && 'bg-transparent',
      className,
    )}
  >
    {children}
  </div>
);

/** Panel header with a pixel-font kicker, title, and optional right-hand slot. */
export const PanelHead: React.FC<{
  kicker?: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  right?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}> = ({ kicker, title, sub, right, icon, className }) => (
  <div
    className={cx(
      'flex items-start justify-between gap-4 border-b border-line-soft px-4 py-3',
      className,
    )}
  >
    <div className="min-w-0">
      {kicker && <div className="pixel-label mb-1.5 text-txt-4">{kicker}</div>}
      <h3 className="flex items-center gap-2 text-title font-semibold text-txt">
        {icon}
        {/* Clamped rather than truncated — fixture names like
            "(negative case — not a plant)" lose their meaning at one line. */}
        <span className="line-clamp-2 min-w-0">{title}</span>
      </h3>
      {sub && <p className="mt-1 text-meta text-txt-3">{sub}</p>}
    </div>
    {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
  </div>
);

/* -------------------------------------------------------------------------- */
/* Page header — one per route                                                 */
/* -------------------------------------------------------------------------- */

export const PageHead: React.FC<{
  kicker: string;
  title: string;
  sub?: string;
  right?: React.ReactNode;
}> = ({ kicker, title, sub, right }) => (
  <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <div className="pixel-label mb-2 text-brand">{kicker}</div>
      <h1 className="text-display font-semibold text-txt">{title}</h1>
      {sub && <p className="mt-1.5 max-w-2xl text-body text-txt-3">{sub}</p>}
    </div>
    {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
  </div>
);

/* -------------------------------------------------------------------------- */
/* Badge / chip                                                                */
/* -------------------------------------------------------------------------- */

export const Badge: React.FC<{
  children: React.ReactNode;
  tone?: Tone;
  dot?: boolean;
  mono?: boolean;
  className?: string;
}> = ({ children, tone = 'neutral', dot, mono, className }) => {
  const t = TONE[tone];
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-chip border px-2 py-0.5 text-label font-semibold whitespace-nowrap',
        mono && 'font-mono',
        t.text,
        t.border,
        t.fill,
        className,
      )}
    >
      {dot && <span className={cx('h-1.5 w-1.5 rounded-full', t.dot)} />}
      {children}
    </span>
  );
};

/* -------------------------------------------------------------------------- */
/* Buttons                                                                     */
/* -------------------------------------------------------------------------- */

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
};

export const Button: React.FC<BtnProps> = ({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  className,
  ...rest
}) => (
  <button
    {...rest}
    className={cx(
      'inline-flex items-center justify-center gap-2 rounded-card font-semibold whitespace-nowrap transition-colors',
      'disabled:pointer-events-none disabled:opacity-40',
      size === 'sm' && 'px-2.5 py-1.5 text-label',
      size === 'md' && 'px-3.5 py-2 text-meta',
      size === 'lg' && 'px-5 py-3 text-body',
      variant === 'primary' && 'bg-brand text-base hover:bg-brand-hi active:bg-brand-lo',
      variant === 'secondary' &&
        'border border-line bg-raised text-txt-2 hover:border-line-strong hover:bg-elevated hover:text-txt',
      variant === 'ghost' && 'text-txt-3 hover:bg-raised hover:text-txt',
      variant === 'danger' && 'border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20',
      className,
    )}
  >
    {icon}
    {children}
  </button>
);

/* -------------------------------------------------------------------------- */
/* Stat tile — big number first, label second                                  */
/* -------------------------------------------------------------------------- */

export const Stat: React.FC<{
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: Tone;
  icon?: React.ReactNode;
}> = ({ label, value, sub, tone = 'neutral', icon }) => (
  <div className="rounded-card border border-line bg-panel px-3.5 py-3">
    <div className="flex items-center gap-1.5 text-label font-medium tracking-wide text-txt-4 uppercase">
      {icon}
      <span className="truncate">{label}</span>
    </div>
    <div className={cx('mt-1.5 font-mono text-title font-bold', TONE[tone].text)}>{value}</div>
    {sub && <div className="mt-0.5 text-label text-txt-4">{sub}</div>}
  </div>
);

/* -------------------------------------------------------------------------- */
/* Key/value row — replaces the ad-hoc flex-justify-between pairs              */
/* -------------------------------------------------------------------------- */

export const Row: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: Tone;
  strike?: boolean;
}> = ({ label, value, tone = 'neutral', strike }) => (
  <div className="flex items-baseline justify-between gap-3 text-meta">
    <span className="text-txt-4">{label}</span>
    <span
      className={cx(
        'truncate text-right font-mono font-medium',
        tone === 'neutral' ? 'text-txt-2' : TONE[tone].text,
        strike && 'line-through opacity-50',
      )}
    >
      {value}
    </span>
  </div>
);

/* -------------------------------------------------------------------------- */
/* Meter                                                                       */
/* -------------------------------------------------------------------------- */

export const Meter: React.FC<{ pct: number; tone?: Tone; height?: string }> = ({
  pct,
  tone = 'brand',
  height = 'h-1.5',
}) => (
  <div className={cx('w-full overflow-hidden rounded-full bg-void', height)}>
    <div
      className={cx('h-full rounded-full transition-all duration-500', TONE[tone].dot)}
      style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
    />
  </div>
);

/* -------------------------------------------------------------------------- */
/* Sprite frame — checkerboard + scanlines + pixel-perfect scaling             */
/* -------------------------------------------------------------------------- */

export const SpriteFrame: React.FC<{
  src?: string | null;
  alt: string;
  size?: 'sm' | 'md' | 'hero';
  caption?: string;
  placeholder?: React.ReactNode;
  glow?: boolean;
}> = ({ src, alt, size = 'md', caption, placeholder, glow }) => (
  <div
    className={cx(
      'checkerboard relative overflow-hidden rounded-card border-2',
      glow ? 'border-brand/40' : 'border-line-strong',
      size === 'sm' && 'h-16 w-16',
      size === 'md' && 'h-32 w-32',
      size === 'hero' && 'aspect-square w-full max-w-[300px]',
    )}
    style={glow ? { boxShadow: '0 0 0 1px rgb(155 213 71 / 0.15), 0 8px 32px -8px rgb(155 213 71 / 0.25)' } : undefined}
  >
    {src ? (
      <img src={src} alt={alt} className="pixelated h-full w-full object-contain p-2" />
    ) : (
      <div className="flex h-full w-full items-center justify-center text-txt-4">{placeholder}</div>
    )}

    {/* CRT scanlines, purely decorative */}
    <div className="scanlines-overlay pointer-events-none absolute inset-0" aria-hidden="true" />

    {caption && (
      <span className="absolute right-1.5 bottom-1.5 rounded-chip border border-line bg-void/90 px-1.5 py-0.5 font-mono text-[10px] text-txt-3">
        {caption}
      </span>
    )}
  </div>
);

/* -------------------------------------------------------------------------- */
/* Empty state                                                                 */
/* -------------------------------------------------------------------------- */

export const Empty: React.FC<{
  icon: React.ReactNode;
  title: string;
  sub?: string;
  action?: React.ReactNode;
}> = ({ icon, title, sub, action }) => (
  <div className="flex flex-col items-center justify-center rounded-pane border border-dashed border-line px-6 py-16 text-center">
    <div className="mb-3 text-txt-5">{icon}</div>
    <p className="text-body font-semibold text-txt-2">{title}</p>
    {sub && <p className="mt-1 max-w-sm text-meta text-txt-4">{sub}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

/* -------------------------------------------------------------------------- */
/* Spinner                                                                     */
/* -------------------------------------------------------------------------- */

export const Spinner: React.FC<{ className?: string }> = ({ className = 'h-4 w-4' }) => (
  <div
    className={cx('animate-spin rounded-full border-2 border-line-strong border-t-brand', className)}
    role="status"
    aria-label="Loading"
  />
);

export { cx };
