/**
 * The almanac grid: 200 Singapore flowering plants, found and unfound.
 *
 * Undiscovered species show a silhouette — the species is named, because an
 * almanac that tells you what to go and look for is the point, but the creature
 * behind it is not revealed until someone brings one in.
 *
 * The silhouette is drawn rather than loaded. Two hundred image requests for
 * art that is a single flat shape would be two hundred requests, and an SVG
 * takes the surrounding text colour, so the same component covers the dark
 * landing page and the light admin dashboard.
 */
import type { AlmanacEntry } from '../../services/sproutApi';

/** A generic leafy silhouette: pot, stem, three leaves. */
export function PlantSilhouette({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
    >
      <path d="M23 44h2V25h-2z" />
      <path d="M24 26c-7 0-12-4-13-11 7-1 12 3 13 11z" />
      <path d="M24 26c7 0 12-4 13-11-7-1-12 3-13 11z" />
      <path d="M24 20c0-6 2-10 6-13 3 5 1 11-6 13z" />
      <path d="M14 36h20l-2 8H16z" />
    </svg>
  );
}

export interface AlmanacGridProps {
  species: AlmanacEntry[];
  /** Called when a found card is activated. Unfound cards are never clickable —
   *  there is nothing behind them yet. */
  onSelect?: (entry: AlmanacEntry) => void;
  /** 'dark' for the landing page over the green field, 'light' for /admin. */
  tone?: 'dark' | 'light';
  /** Rows visible before the grid scrolls inside itself. 200 cards down the
   *  page buries everything under it; four rows is a window onto the list. */
  visibleRows?: number;
}

/** Card height plus the gap, in rem — the unit the scroll window is cut from. */
const ROW_HEIGHT_REM = 9.5;

export function AlmanacGrid({
  species,
  onSelect,
  tone = 'dark',
  visibleRows,
}: AlmanacGridProps) {
  const dark = tone === 'dark';
  const windowed = typeof visibleRows === 'number' && visibleRows > 0;

  return (
    <ul
      className={`grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5${
        // overscroll-contain stops a flick inside the grid from running on and
        // scrolling the page once it bottoms out.
        windowed ? ' overflow-y-auto overscroll-contain pr-2' : ''
      }`}
      style={windowed ? { maxHeight: `${visibleRows! * ROW_HEIGHT_REM}rem` } : undefined}
      // The list is long; the label is what a screen reader announces on entry.
      aria-label={`${species.length} species`}
      tabIndex={windowed ? 0 : undefined}
    >
      {species.map((entry) => {
        const card = (
          <>
            <PlantSilhouette
              className={`mx-auto h-14 w-14 shrink-0 ${
                entry.discovered
                  ? 'text-[color:var(--color-hp-high)]'
                  : dark
                    ? 'text-white/15'
                    : 'text-black/15'
              }`}
            />
            <p
              className={`mt-2 text-[11px] leading-snug font-semibold italic ${
                dark ? 'text-white/85' : ''
              }`}
            >
              {entry.speciesName}
            </p>
            <p className={`text-[10px] leading-snug ${dark ? 'text-white/45' : 'opacity-60'}`}>
              {entry.commonName ?? entry.family}
            </p>
            <p
              className={`font-pixel mt-2 text-[7px] ${
                entry.discovered
                  ? 'text-[color:var(--color-hp-high)]'
                  : dark
                    ? 'text-white/30'
                    : 'opacity-40'
              }`}
            >
              {entry.discovered
                ? `Found ×${entry.discoveryCount}`
                : 'Not yet found'}
            </p>
          </>
        );

        const shell = dark
          ? 'pixel-panel-dark h-full w-full p-3 text-center'
          : 'pixel-panel h-full w-full p-3 text-center';

        return (
          <li key={entry.id}>
            {onSelect && entry.discovered ? (
              <button
                type="button"
                onClick={() => onSelect(entry)}
                className={`press ${shell} cursor-pointer`}
              >
                {card}
              </button>
            ) : (
              <div className={shell}>{card}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
