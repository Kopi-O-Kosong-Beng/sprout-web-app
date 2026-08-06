import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import BackButton from '../components/common/BackButton';
import {
  CaptureBadge,
  PlantAvatar,
  StatGrid,
  type PlantAvatarData,
} from '../components/common/PlantVisuals';
import { useArchive } from '../hooks/useArchive';
import { summarise } from '../utils/text';

/**
 * The archive, drawn as the Android garden: pots resting on shelf planks, three
 * to a plank, with the selected plant's record on a card underneath.
 *
 * Ported from plantemon-web's (app)/garden/page.tsx. That screen hard-capped at
 * six pots because the Android garden had six; the archive here has no cap, so
 * the shelves keep stacking in rows of three and the empty tail of the last row
 * is padded out so the plank still reads as a shelf.
 */

/** Pots to a plank, from activity_garden.xml. */
const SLOTS_PER_SHELF = 3;

type SortOption =
  | 'discovered-newest'
  | 'discovered-oldest'
  | 'hp-desc'
  | 'hp-asc'
  | 'attack-desc'
  | 'attack-asc'
  | 'defense-desc'
  | 'defense-asc'
  | 'speed-desc'
  | 'speed-asc'
  | 'name-asc'
  | 'name-desc';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'discovered-newest', label: 'Discovery Date (Newest)' },
  { value: 'discovered-oldest', label: 'Discovery Date (Oldest)' },
  { value: 'hp-desc', label: 'HP (Highest)' },
  { value: 'hp-asc', label: 'HP (Lowest)' },
  { value: 'attack-desc', label: 'ATK (Highest)' },
  { value: 'attack-asc', label: 'ATK (Lowest)' },
  { value: 'defense-desc', label: 'DEF (Highest)' },
  { value: 'defense-asc', label: 'DEF (Lowest)' },
  { value: 'speed-desc', label: 'SPD (Highest)' },
  { value: 'speed-asc', label: 'SPD (Lowest)' },
  { value: 'name-asc', label: 'Name (A-Z)' },
  { value: 'name-desc', label: 'Name (Z-A)' },
];

/** `avatar.discovered` is already formatted for display ("04 Aug 2026"); this
 *  re-parses it for chronological sort. Falls back to 0 (oldest) so a record
 *  with an unparseable date sinks to the end instead of throwing. */
function discoveredTimestamp(discovered: string): number {
  const parsed = Date.parse(discovered);
  return Number.isNaN(parsed) ? 0 : parsed;
}

type SourceFilter = 'all' | 'mobile' | 'web';

const SOURCE_FILTER_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: 'web', label: 'Web Upload' },
  { value: 'mobile', label: 'IRL Scan' },
  { value: 'all', label: 'Both' },
];

/** Must match the panel's `w-[…px]` class below — there's no way to share a
 *  single value between a Tailwind arbitrary-value class (static string, read
 *  by its build-time scanner) and this runtime position calculation. */
const FILTER_PANEL_WIDTH = 250;

export default function ArchivePage() {
  const navigate = useNavigate();
  const demoToolsEnabled = import.meta.env.VITE_ENABLE_DEMO_TOOLS === 'true';
  // `error` is deliberately not destructured. The archive-unavailable state
  // now shows fixed copy (UC4 alt-flow 1a) rather than the server's own text,
  // which is the same direction 8d59b23 took the rest of the UI.
  const { avatars, status, demoEnabled, setDemoEnabled, removePlant, retry } =
    useArchive();
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  const [isDetailClosed, setIsDetailClosed] = useState(false);
  const [isEmptyStateDismissed, setIsEmptyStateDismissed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('discovered-newest');
  const [familyFilter, setFamilyFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [shovelArmed, setShovelArmed] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<PlantAvatarData | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const archiveContentRef = useRef<HTMLDivElement>(null);
  const [filterPanelPosition, setFilterPanelPosition] = useState<{ top: number; left: number } | null>(
    null
  );
  const demoAction = demoEnabled ? 'Remove demo plants' : 'Add five demo plants';
  const settled = status === 'ready' || status === 'mutating';

  // The derived `shovelling` below only HIDES the mode when the archive
  // empties — without this the stale armed state pops back the moment demo
  // plants are re-added, wiggling sprites nobody asked to dig.
  useEffect(() => {
    if (avatars.length === 0) setShovelArmed(false);
  }, [avatars.length]);

  // Derived, so an emptied archive can't leave a stale mode armed (the
  // plantemon-web garden's rule, kept as-is).
  //
  // Gated on `avatars`, deliberately not `visibleAvatars`: filtering every
  // plant out of view is not the same as owning none, and disarming the
  // shovel on a search keystroke would be a surprising way to lose the mode.
  const shovelling = shovelArmed && settled && avatars.length > 0;

  // Closes the Filter & Sort dropdown on an outside click or Escape, and on
  // Escape returns focus to its trigger so keyboard users don't lose place.
  useEffect(() => {
    if (!isFilterOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsFilterOpen(false);
        filterButtonRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFilterOpen]);

  // Populated from the caller's own collection rather than a fixed list, so it
  // only ever offers families that could actually match something.
  const familyOptions = useMemo(() => {
    const families = new Set(avatars.map((avatar) => avatar.family).filter(Boolean));
    return Array.from(families).sort((a, b) => a.localeCompare(b));
  }, [avatars]);

  const hasActiveFilters =
    sortOption !== 'discovered-newest' || familyFilter !== 'all' || sourceFilter !== 'all';

  function clearFilters() {
    setSortOption('discovered-newest');
    setFamilyFilter('all');
    setSourceFilter('all');
  }

  // Filtering and sorting run client-side over the already-loaded archive, so
  // typing a search or changing a filter never re-fetches.
  const visibleAvatars = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matched = avatars.filter((avatar) => {
      if (query && !avatar.name.toLowerCase().includes(query)) return false;
      if (familyFilter !== 'all' && avatar.family !== familyFilter) return false;
      if (sourceFilter !== 'all' && avatar.source !== sourceFilter) return false;
      return true;
    });

    return [...matched].sort((a, b) => {
      switch (sortOption) {
        case 'discovered-newest':
          return discoveredTimestamp(b.discovered) - discoveredTimestamp(a.discovered);
        case 'discovered-oldest':
          return discoveredTimestamp(a.discovered) - discoveredTimestamp(b.discovered);
        case 'hp-desc':
          return b.hp - a.hp;
        case 'hp-asc':
          return a.hp - b.hp;
        case 'attack-desc':
          return b.attack - a.attack;
        case 'attack-asc':
          return a.attack - b.attack;
        case 'defense-desc':
          return b.defense - a.defense;
        case 'defense-asc':
          return a.defense - b.defense;
        case 'speed-desc':
          return b.speed - a.speed;
        case 'speed-asc':
          return a.speed - b.speed;
        case 'name-asc':
          return a.name.localeCompare(b.name);
        case 'name-desc':
          return b.name.localeCompare(a.name);
        default:
          return 0;
      }
    });
  }, [avatars, searchQuery, sortOption, familyFilter, sourceFilter]);

  // Positioned in the empty margin to the right of the main content
  // container (the shelves/detail panel, measured via `archiveContentRef`)
  // rather than at a fixed viewport percentage — a percentage-based guess
  // can't guarantee zero overlap the way measuring the container's actual
  // right edge does.
  //
  // Depends on [settled, visibleAvatars.length]: on first mount the archive
  // is still loading, so `archiveContentRef.current` is null (that div only
  // renders once there's data) and the measurement would silently fall back
  // to the button's edge — much narrower than the real content — and never
  // correct itself, since a `[]`-dependency effect never re-runs. Re-running
  // once data actually arrives fixes that.
  useEffect(() => {
    function updateFilterPanelPosition() {
      if (!filterButtonRef.current) return;
      const buttonRect = filterButtonRef.current.getBoundingClientRect();
      const contentRight =
        archiveContentRef.current?.getBoundingClientRect().right ?? buttonRect.right;
      // On a wide screen the content column is capped (`max-w-3xl`), leaving
      // real margin to sit in. Below that width the column fills the whole
      // viewport, so `contentRight + 16` would land past the actual screen
      // edge — clamp to the viewport so the panel stays visible and just
      // right-aligns within it instead of trying to sit beside content that
      // no longer has any space beside it.
      const maxLeft = window.innerWidth - FILTER_PANEL_WIDTH - 16;
      setFilterPanelPosition({
        top: buttonRect.bottom + 8,
        left: Math.min(contentRight + 16, maxLeft),
      });
    }

    updateFilterPanelPosition();
    window.addEventListener('resize', updateFilterPanelPosition);
    return () => window.removeEventListener('resize', updateFilterPanelPosition);
  }, [settled, visibleAvatars.length]);

  const selected = isDetailClosed
    ? null
    : (visibleAvatars.find((avatar) => avatar.id === selectedAvatarId) ??
      visibleAvatars[0] ??
      null);

  // Picking a pot always brings the detail panel back, even after it was
  // closed with the X.
  function handleSelectAvatar(id: string) {
    setSelectedAvatarId(id);
    setIsDetailClosed(false);
  }

  async function confirmRemoval() {
    if (!pendingRemoval) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await removePlant(pendingRemoval.id);
      setPendingRemoval(null);
    } catch (caught) {
      setRemoveError(
        caught instanceof Error ? caught.message : 'Could not remove that plant.'
      );
    } finally {
      setRemoving(false);
    }
  }

  function closeRemoveDialog() {
    setPendingRemoval(null);
    setRemoveError(null);
  }

  // Pad the final plank so a row of one or two still sits on a full shelf.
  const shelfCount = Math.max(1, Math.ceil(visibleAvatars.length / SLOTS_PER_SHELF));
  const shelves = Array.from({ length: shelfCount }, (_, row) =>
    Array.from(
      { length: SLOTS_PER_SHELF },
      (_, column) => visibleAvatars[row * SLOTS_PER_SHELF + column]
    )
  );

  return (
    <main className="screen screen-scrollable flex flex-col">
      {/*
        Pinned to the viewport, not to the screen box. `.screen` sets only
        min-height, so on a scrollable screen its used height grows with the
        content — and `h-full` grew with it, handing object-fit: cover a box
        taller than the viewport to fill. Measured on the archive: a 500x813
        viewport gave the image a 500x1288 box, magnifying the painted art
        1.26x and more as plants are added, which reads as a stretched
        background. A fixed backdrop also stays put while the shelves scroll
        over it, instead of scrolling away and leaving bare colour.
      */}
      <img
        src="/img/bg_garden.jpeg"
        alt=""
        className="fixed inset-0 -z-10 h-[100dvh] w-full object-cover"
      />

      <div className="safe-top relative z-30 flex items-center justify-between gap-2 px-3">
        <BackButton />
        <div className="flex items-center gap-2">
          {demoToolsEnabled && settled && (
            <button
              className="press pixel-button px-3 py-2 text-[9px]"
              type="button"
              role="switch"
              aria-checked={demoEnabled}
              aria-label={demoAction}
              aria-busy={status === 'mutating'}
              disabled={status !== 'ready'}
              onClick={() => void setDemoEnabled(!demoEnabled)}
            >
              {demoAction}
            </button>
          )}
          {settled && avatars.length > 0 && (
            <button
              type="button"
              aria-pressed={shovelling}
              aria-label={shovelling ? 'Stop shovelling' : 'Remove plants'}
              onClick={() => setShovelArmed((on) => !on)}
              // Inline background wins over .pixel-button's unlayered shorthand.
              style={shovelling ? { background: 'var(--color-hp-low)' } : undefined}
              className="press pixel-button flex h-11 w-11 items-center justify-center text-lg"
            >
              {/* U+26CF, not the shovel emoji U+1FA8F (Unicode 16, 2024) —
                  which still renders as a tofu box on most installed OSes. */}
              <span aria-hidden="true">⛏️</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 px-4">
        <img
          src="/img/ic_garden_header.png"
          alt=""
          className="pixelated h-16 w-16 object-contain sm:h-24 sm:w-24"
        />
        <h1 className="font-pixel text-outline text-xl text-white sm:text-3xl">Archive</h1>
      </div>

      {/* The removal dialog narrates its own busy state, so the banner stays
          the demo switch's alone. */}
      {status === 'mutating' && !pendingRemoval && (
        <p
          className="pixel-panel mx-auto mt-2 px-3 py-2 text-center text-[10px]"
          role="status"
          aria-label="Updating demo plants"
        >
          Updating demo plants...
        </p>
      )}

      {shovelling && (
        <p className="pixel-panel mx-auto mt-2 px-3 py-2 text-center text-[10px] leading-relaxed">
          Tap a plant to dig it up. Tap the shovel again to stop.
        </p>
      )}

      {status === 'loading' && (
        <div
          className="flex flex-1 items-center justify-center p-8"
          role="status"
          aria-label="Loading archive"
          aria-live="polite"
        >
          <p className="pixel-panel font-pixel px-4 py-3 text-xs">Loading…</p>
        </div>
      )}

      {status === 'error' && (
        <ArchiveModal titleId="archive-error-heading">
          <h2 id="archive-error-heading" className="font-pixel text-xs leading-relaxed">
            Archive unavailable
          </h2>
          <p className="mt-2 text-[10px] leading-relaxed opacity-80">
            We couldn't reach your plant archive. This is usually temporary.
          </p>
          <button
            className="press pixel-button mt-4 w-full px-2 py-2 text-[9px]"
            type="button"
            onClick={retry}
          >
            Retry
          </button>
        </ArchiveModal>
      )}

      {settled && avatars.length === 0 && !isEmptyStateDismissed && (
        <ArchiveModal
          titleId="archive-empty-heading"
          onDismiss={() => setIsEmptyStateDismissed(true)}
        >
          <h2 id="archive-empty-heading" className="font-pixel text-xs leading-relaxed">
            No plants collected yet
          </h2>
          <p className="mt-2 text-[10px] leading-relaxed opacity-80">
            You haven't caught any plants yet. Open the Sprout mobile app and scan a real plant to
            start your collection.
          </p>
          <button
            className="press pixel-button mt-4 w-full px-2 py-2 text-[9px]"
            type="button"
            onClick={() => navigate('/')}
          >
            Back to Home
          </button>
        </ArchiveModal>
      )}

      {settled && avatars.length > 0 && (
        <div className="mx-auto mt-2 w-full max-w-3xl px-2">
          <div className="flex items-stretch gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 opacity-60"
              />
              <label className="sr-only" htmlFor="archive-search">
                Search by name
              </label>
              <input
                id="archive-search"
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by name..."
                className="h-[2.2rem] w-full border-2 border-black bg-white pr-3 pl-9 text-xs text-black focus:outline-3 focus:outline-offset-1 focus:outline-[color:var(--color-brand)]"
              />
            </div>

            <div ref={filterMenuRef} className="relative shrink-0">
              <button
                ref={filterButtonRef}
                type="button"
                aria-haspopup="true"
                aria-expanded={isFilterOpen}
                onClick={() => setIsFilterOpen((open) => !open)}
                className="press pixel-button pixel-button-accent-hover relative h-[2.2rem] px-3 text-[9px]"
              >
                Filter/Sort
                {hasActiveFilters && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-[color:var(--color-f24-red)]"
                  />
                )}
              </button>

              {/* Always mounted (not conditionally rendered) so the slide
                  transition plays both opening and closing — a mount/unmount
                  would only ever show the open state instantly. `inert` pulls
                  it out of tab order and the accessibility tree while hidden
                  off-screen. `fixed` with a JS-measured `top`/`left` (from
                  `filterPanelPosition`) rather than `absolute` relative to the
                  button — centering between the button's right edge and the
                  actual screen edge isn't expressible as a fixed Tailwind
                  offset, since that gap's width depends on the viewport.
                  Sized to its content (no fixed height) instead of stretching
                  the full viewport. */}
              <div
                style={filterPanelPosition ?? undefined}
                className={`fixed z-20 w-[250px] rounded-xl border border-black/10 bg-white p-4 text-black shadow-xl transition-transform duration-300 ease-in-out ${
                  isFilterOpen
                    ? 'translate-x-0'
                    : 'pointer-events-none translate-x-[100vw]'
                }`}
                inert={!isFilterOpen}
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-pixel text-xs font-bold">Filter/Sort</h2>
                  <button
                    type="button"
                    onClick={() => setIsFilterOpen(false)}
                    aria-label="Close filter options"
                    className="press pixel-button pixel-button-icon flex h-6 w-6 items-center justify-center text-sm leading-none"
                  >
                    ×
                  </button>
                </div>

                <div className="mt-3 flex flex-col divide-y divide-black/10">
                  <label className="flex flex-col gap-1 pb-3">
                    <span className="font-pixel text-[8px] opacity-70">Sort by</span>
                    <select
                      value={sortOption}
                      onChange={(event) => setSortOption(event.target.value as SortOption)}
                      className="border-2 border-black bg-white px-2 py-1.5 text-xs text-black focus:outline-3 focus:outline-offset-1 focus:outline-[color:var(--color-brand)]"
                    >
                      {SORT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 py-3">
                    <span className="font-pixel text-[8px] opacity-70">Family</span>
                    <select
                      value={familyFilter}
                      onChange={(event) => setFamilyFilter(event.target.value)}
                      className="border-2 border-black bg-white px-2 py-1.5 text-xs text-black focus:outline-3 focus:outline-offset-1 focus:outline-[color:var(--color-brand)]"
                    >
                      <option value="all">All families</option>
                      {familyOptions.map((family) => (
                        <option key={family} value={family}>
                          {family}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="flex flex-col gap-1 py-3">
                    <span className="font-pixel text-[8px] opacity-70">Source</span>
                    <div className="flex gap-1">
                      {SOURCE_FILTER_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={sourceFilter === option.value}
                          onClick={() => setSourceFilter(option.value)}
                          className={
                            sourceFilter === option.value
                              ? 'press flex-1 border-2 border-black bg-[color:var(--color-brand)] px-1.5 py-1.5 text-[8px] font-bold text-black'
                              : 'press flex-1 border-2 border-black bg-white px-1.5 py-1.5 text-[8px] text-black'
                          }
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={clearFilters}
                    className="pt-3 text-left font-pixel text-[8px] underline opacity-70 hover:opacity-100"
                  >
                    Clear all
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {settled && avatars.length > 0 && visibleAvatars.length === 0 && (
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="pixel-panel w-full max-w-xs p-4 text-center text-xs leading-relaxed">
            No plants match your filters.
          </p>
        </div>
      )}

      {settled && visibleAvatars.length > 0 && (
        <div ref={archiveContentRef} className="safe-bottom mx-auto w-full max-w-3xl px-2 pb-6">
          <div className="mt-2 flex flex-col gap-2">
            {shelves.map((plants, index) => (
              <Shelf
                key={index}
                plants={plants}
                selectedId={selected?.id ?? null}
                shovelling={shovelling}
                onSelect={handleSelectAvatar}
                // Never retarget an open dialog: the page behind the scrim is
                // still keyboard-operable, and swapping the pending plant
                // mid-flight could confirm-delete a plant nobody agreed to.
                onDig={(plant) => setPendingRemoval((current) => current ?? plant)}
              />
            ))}
          </div>

          {selected && (
            <SpecimenCard
              avatar={selected}
              busy={status === 'mutating'}
              onClose={() => setIsDetailClosed(true)}
              onBattle={() =>
                navigate('/battle', {
                  state: { avatarId: selected.id, avatar: selected },
                })
              }
            />
          )}
        </div>
      )}

      {pendingRemoval && (
        <RemoveDialog
          plant={pendingRemoval}
          busy={removing}
          error={removeError}
          onConfirm={() => void confirmRemoval()}
          onCancel={closeRemoveDialog}
        />
      )}
    </main>
  );
}

/**
 * A true overlay for states that need to visually pop above the whole
 * screen — the failed-load and true-empty states — rather than swapping
 * into the content area the way the loading spinner and the "no filter
 * matches" message do. The header (Back button, title) sits at a higher
 * z-index than this so it stays reachable even while the modal is open.
 *
 * `onDismiss` is optional: omit it for a state with nothing meaningful to
 * reveal behind it (a failed load), where Retry is the only way out.
 */
function ArchiveModal({
  titleId,
  onDismiss,
  children,
}: {
  titleId: string;
  onDismiss?: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!onDismiss) return;
    // An arrow const, not a `function` declaration: declarations are hoisted,
    // so TypeScript will not carry the `!onDismiss` narrowing into one and the
    // call below fails the build. Same shape as ScanPage's Overlay.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onDismiss]);

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-6"
      onClick={onDismiss}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="pixel-panel w-full max-w-md p-6 text-center focus:outline-3 focus:outline-offset-1 focus:outline-[color:var(--color-brand)]"
      >
        {children}
      </div>
    </div>
  );
}

/** Confirms a permanent removal — the delete hits the cloud archive.
 *  Ported from the plantemon-web garden's dialog, plus an error line so a
 *  failed delete says why instead of silently staying. */
function RemoveDialog({
  plant,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  plant: PlantAvatarData;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-6"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) onCancel();
      }}
    >
      <div
        className="pixel-panel w-full max-w-xs p-4 text-center"
        role="alertdialog"
        aria-modal="true"
        aria-label={`Dig up ${plant.name}?`}
      >
        <div className="text-3xl" aria-hidden="true">⛏️</div>
        <h2 className="font-pixel mt-2 text-xs leading-relaxed">Dig up {plant.name}?</h2>
        <p className="mt-2 text-[10px] leading-relaxed opacity-80">
          This removes it from your archive for good.
        </p>
        {error && (
          <p
            className="mt-2 text-[10px] leading-relaxed"
            style={{ color: 'var(--color-danger-ink)' }}
            role="alert"
          >
            {error}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            style={{ background: 'var(--color-hp-low)', color: '#fff' }}
            className="press pixel-button flex-1 px-2 py-2 text-[9px]"
          >
            {busy ? 'Digging…' : 'Dig up'}
          </button>
          {/* autoFocus: moving focus INTO the dialog is what makes a screen
              reader announce it, keeps Escape working (the wrapper's handler
              only hears keys from within), and takes focus off the shelf
              button behind the scrim, which stays keyboard-reachable. */}
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            autoFocus
            className="press pixel-button px-3 py-2 text-[9px]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/** One plank with three potted slots resting on it. Shovelling swaps what a
 *  tap means — dig up instead of select — and sets the sprites squirming so
 *  the mode is visible on the shelf itself. */
function Shelf({
  plants,
  selectedId,
  shovelling,
  onSelect,
  onDig,
}: {
  plants: (PlantAvatarData | undefined)[];
  selectedId: string | null;
  shovelling: boolean;
  onSelect: (id: string) => void;
  onDig: (plant: PlantAvatarData) => void;
}) {
  return (
    <section className="relative">
      {/* Slots sit directly on the plank, which is drawn behind their feet. */}
      <div className="relative z-10 flex items-end justify-around">
        {plants.map((avatar, index) =>
          avatar ? (
            <button
              key={avatar.id}
              type="button"
              aria-label={
                shovelling
                  ? `Dig up ${avatar.name}`
                  : `Select ${avatar.name}${avatar.isDemo ? ' (Demo)' : ''}`
              }
              aria-pressed={shovelling ? undefined : avatar.id === selectedId}
              onClick={() => (shovelling ? onDig(avatar) : onSelect(avatar.id))}
              // `archive-pot` drives the hover hop. Withheld from the selected
              // pot (it already shows a solid ring) and while shovelling, where
              // the wiggle owns the motion — two animations on one sprite read
              // as a glitch rather than as either cue.
              className={
                shovelling || avatar.id === selectedId
                  ? 'press flex w-1/3 flex-col items-center'
                  : 'press archive-pot flex w-1/3 flex-col items-center'
              }
            >
              <span
                className={
                  !shovelling && avatar.id === selectedId
                    ? 'pot-ring relative block rounded-full outline-3 outline-offset-2 outline-[color:var(--color-brand)]'
                    : 'pot-ring relative block rounded-full'
                }
              >
                <PlantAvatar avatar={avatar} wiggle={shovelling} />
              </span>
              {/* On the shelf the badge is how you tell, at a glance, which of
                  your plants are on the clock — the card only shows one. */}
              <CaptureBadge source={avatar.source} className="mt-1" />
              {avatar.isDemo && (
                <span className="font-pixel border-2 border-black bg-[color:var(--color-hp-mid)] px-1 text-[9px]">
                  Demo
                </span>
              )}
              <span className="font-pixel text-outline max-w-full truncate px-1 text-[9px] text-white sm:text-[9px]">
                {avatar.name}
              </span>
            </button>
          ) : (
            <div key={`empty-${index}`} className="flex w-1/3 flex-col items-center opacity-90">
              <span className="relative flex h-22 w-full items-end justify-center">
                <img
                  src="/img/ic_pot_empty.png"
                  alt="Empty pot"
                  className="pixelated h-14 w-14 object-contain sm:h-16 sm:w-16"
                />
              </span>
            </div>
          )
        )}
      </div>
      <img
        src="/img/ic_shelf.png"
        alt=""
        className="pixelated -mt-2 h-5 w-full object-fill sm:h-8"
      />
    </section>
  );
}

/**
 * What a web upload has left, beside its badge.
 *
 * Only web uploads expire, so this says nothing at all about an IRL scan —
 * "Kept" on every permanent plant would be noise on four cards out of five.
 * Expiry is read from `battleEligible`, the server's own verdict, so a stale
 * browser clock cannot claim a plant is alive when the API will refuse it.
 */
function RetentionNote({ avatar }: { avatar: PlantAvatarData }) {
  if (avatar.source !== 'web' || !avatar.expiresAt) return null;

  if (avatar.battleEligible === false) {
    return (
      <span className="text-[9px] leading-relaxed text-red-700">
        Expired — can no longer battle
      </span>
    );
  }

  const expiresAt = Date.parse(avatar.expiresAt);
  const hoursLeft = Number.isNaN(expiresAt)
    ? null
    : Math.max(0, Math.ceil((expiresAt - Date.now()) / (60 * 60 * 1000)));

  return (
    <span className="text-[9px] leading-relaxed opacity-70">
      {hoursLeft === null
        ? 'Expires 24 hours after upload'
        : `Expires in ${hoursLeft} ${hoursLeft === 1 ? 'hour' : 'hours'}`}
    </span>
  );
}

/**
 * The photograph the sprite was drawn from, under the creature it became.
 *
 * Renders nothing when a record has no photo — a scanned plant does not keep
 * one — and drops out if the file is missing, so a demo plant whose art has not
 * been added yet shows the pot alone rather than a broken-image icon.
 */
function SpecimenPhoto({ avatar }: { avatar: PlantAvatarData }) {
  const [failed, setFailed] = useState(false);
  const photoUrl = avatar.photoUrl?.trim();
  if (!photoUrl || failed) return null;

  return (
    <figure className="w-24 sm:w-32">
      <img
        src={photoUrl}
        alt={`Photograph of ${avatar.species}`}
        onError={() => setFailed(true)}
        className="block aspect-square w-full border-2 border-black object-cover"
      />
      <figcaption className="font-pixel mt-1 text-center text-[9px] opacity-60">
        Photographed
      </figcaption>
    </figure>
  );
}

/**
 * The selected plant's record — the Android InfoActivity card, inlined under
 * the shelves rather than living on its own route, so picking a pot and reading
 * its record stay one screen.
 */
function SpecimenCard({
  avatar,
  busy,
  onClose,
  onBattle,
}: {
  avatar: PlantAvatarData;
  busy: boolean;
  onClose: () => void;
  onBattle: () => void;
}) {
  return (
    <div className="pixel-panel relative mt-4 p-4">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close plant details"
        className="press pixel-button pixel-button-icon absolute top-2 right-2 z-10 flex h-6 w-6 items-center justify-center text-sm leading-none"
      >
        ×
      </button>

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        {/*
          Both are keyed on the plant so switching selection remounts them —
          SpecimenPhoto holds a `failed` flag that must not carry over, or one
          plant's broken image would hide the next plant's good one.

          The prefixes are load-bearing. These are siblings, so keying both on
          the bare id gave two children the same key: React warned, then
          duplicated rather than replaced them, and the card grew a second
          sprite and pot on every selection — three plants stacked after two
          clicks, and the same on a delete, since that reselects too.
        */}
        <div className="archive-specimen-avatar flex flex-col items-center gap-2">
          <PlantAvatar key={`avatar-${avatar.id}`} avatar={avatar} large />
          <SpecimenPhoto key={`photo-${avatar.id}`} avatar={avatar} />
        </div>

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="font-pixel text-[9px] opacity-60">Selected plant</p>
          <h2 className="font-pixel mt-2 text-sm leading-relaxed">{avatar.name}</h2>
          <p className="mt-2 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
            <CaptureBadge source={avatar.source} />
            <RetentionNote avatar={avatar} />
          </p>
          <p className="mt-2 text-xs leading-relaxed opacity-80">
            {avatar.species} from {avatar.family}. Discovered on {avatar.discovered}.
          </p>

          {/* Plant.id's prose runs to paragraphs; the card keeps the opening
              and leaves the rest on the record. Same rule as the almanac. */}
          {summarise(avatar.description, 180) && (
            <p className="mt-2 text-xs leading-relaxed opacity-70">
              {summarise(avatar.description, 180)}
            </p>
          )}

          {(avatar.habitat || avatar.conservationStatus) && (
            <dl className="mt-3 space-y-1.5 text-xs leading-relaxed">
              {avatar.habitat && (
                <div>
                  <dt className="font-pixel inline text-[9px]">Habitat</dt>{' '}
                  <dd className="inline opacity-85">{avatar.habitat}</dd>
                </div>
              )}
              {avatar.conservationStatus && (
                <div>
                  <dt className="font-pixel inline text-[9px]">Conservation status</dt>{' '}
                  <dd className="inline opacity-85">{avatar.conservationStatus}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </div>

      <StatGrid avatar={avatar} />

      <button
        className="press pixel-button is-primary mt-4 w-full px-2 py-3 text-[9px]"
        type="button"
        disabled={busy}
        onClick={onBattle}
      >
        Battle with {avatar.name}
      </button>
    </div>
  );
}
