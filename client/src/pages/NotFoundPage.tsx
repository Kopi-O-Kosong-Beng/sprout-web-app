import { Link, useLocation } from 'react-router-dom';

/**
 * The catch-all.
 *
 * Every unknown URL used to `<Navigate to="/" replace />`, which silently
 * rewrote the address bar and dropped the visitor on the marketing home page.
 * Three different failures — a typo, a stale bookmark, and a route that needs
 * a permission the visitor lacks — all looked identical to "you asked for the
 * home page", so nobody could tell which had happened.
 *
 * This says what was not found, keeps the URL so it can be read or corrected,
 * and offers the nearest section rather than only the front door.
 */

/** The section a deep path belongs to, so `/archive/nonsense` offers Archive
 *  rather than only Home. First segment only — that is what names a section
 *  here, and anything deeper is the part that was wrong. */
const SECTIONS: { prefix: string; label: string; to: string }[] = [
  { prefix: 'archive', label: 'Archive', to: '/archive' },
  { prefix: 'scan', label: 'Scan', to: '/scan' },
  { prefix: 'battle', label: 'PVE Battle', to: '/battle' },
  { prefix: 'leaderboard', label: 'Ranking', to: '/leaderboard' },
  { prefix: 'ranking', label: 'Ranking', to: '/leaderboard' },
  { prefix: 'contact', label: 'Contact', to: '/contact' },
];

export default function NotFoundPage() {
  const { pathname } = useLocation();
  const firstSegment = pathname.split('/').filter(Boolean)[0]?.toLowerCase();
  const section = SECTIONS.find((entry) => entry.prefix === firstSegment);

  return (
    <main className="screen screen-scrollable flex flex-col">
      <img
        src="/img/bg_home.jpg"
        alt=""
        className="fixed inset-0 -z-20 h-[100dvh] w-full object-cover"
      />
      <div className="from-sprout/90 via-sprout/40 to-sprout/90 absolute inset-0 -z-10 bg-gradient-to-b" />

      <div className="safe-top safe-bottom mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-8">
        <section className="pixel-panel p-5 text-center">
          <p className="font-pixel text-[9px] opacity-60">Error 404</p>
          <h1 className="font-pixel mt-2 text-sm leading-relaxed">
            This page does not exist
          </h1>
          {/* The address itself, because a typo is the likeliest cause and the
              visitor cannot spot it in a URL bar they have already stopped
              looking at. Wrapped: some of these are long. */}
          <p className="mt-3 text-xs leading-relaxed break-all opacity-80">
            Nothing is served at <code>{pathname}</code>.
          </p>

          <div className="mt-5 flex flex-col gap-2">
            {section && (
              <Link
                className="press pixel-button is-primary w-full px-3 py-3 text-[9px]"
                to={section.to}
              >
                Go to {section.label}
              </Link>
            )}
            <Link
              className={
                section
                  ? 'text-[10px] underline underline-offset-2'
                  : 'press pixel-button is-primary w-full px-3 py-3 text-[9px]'
              }
              to="/"
            >
              Back to home
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
