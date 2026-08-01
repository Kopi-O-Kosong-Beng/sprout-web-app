import { Link } from 'react-router-dom';
import { useArchive } from '../hooks/useArchive';

/**
 * Home hub — the signed-in landing screen, in Sprout branding.
 *
 * Ported from plantemon-web's (app)/home/page.tsx. Its garden counts came from
 * a Postgres-backed GardenProvider; here they come from useArchive, which is
 * this app's own Firestore-backed avatar list — so the hub reports where the
 * player actually is rather than being a row of inert buttons.
 *
 * The structure is the one game hubs converge on: the painted scene up top
 * carrying the identity, a strip of progress stats, then one primary action with
 * the remaining destinations as tiles beneath it. Everything sits in normal
 * flow, so targets stay large and the layout survives any screen height.
 */
export default function HomePage() {
  const { avatars, status } = useArchive();

  const ready = status === 'ready' || status === 'mutating';
  const speciesCount = new Set(avatars.map((avatar) => avatar.species)).size;
  const battleReady = avatars.length > 0;

  /** Each tile's second line reflects live archive state. */
  const destinations = [
    {
      to: '/archive',
      label: 'Archive',
      icon: '/img/ic_nav_garden.png',
      detail: !ready
        ? 'Loading…'
        : avatars.length === 0
          ? 'No plants yet'
          : `${avatars.length} collected`,
    },
    {
      to: '/battle',
      label: 'Adventure',
      icon: '/img/ic_nav_adventure.png',
      // Battle turns away an empty archive; say so here rather than on arrival.
      detail: !ready ? 'Loading…' : battleReady ? 'Battle the bot' : 'Scan a plant first',
    },
  ];

  return (
    <main className="screen screen-scrollable flex flex-col">
      <img
        src="/img/bg_home.jpg"
        alt=""
        className="absolute inset-0 -z-20 h-full w-full object-cover"
      />
      {/*
       * Scrim in the brand green rather than neutral black. Weighted to both
       * ends: the top pass carries the wordmark, the bottom one seats the tiles.
       * The middle stays clear so the painted scene still reads.
       */}
      <div className="from-sprout/90 via-sprout/25 to-sprout/85 absolute inset-0 -z-10 bg-gradient-to-b" />

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4">
        {/* min-h-0 lets the hero absorb the slack, and give it back on short screens. */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 py-6 sm:gap-4">
          {/*
           * The Sprout wordmark, lifted off its brand-green card so it can sit
           * on the painted scene. Capped at 230px because that is close to the
           * source resolution — scaling past it would go soft.
           */}
          <img
            src="/brand/sprout_wordmark_white.png"
            alt="Sprout"
            className="h-auto max-h-[18dvh] w-[min(230px,58vw)] object-contain drop-shadow-[0_3px_14px_rgba(32,55,39,0.9)]"
          />

          {/*
           * Body font, not pixel: the brand wordmark is a brush script, and
           * setting the tagline in Press Start 2P underneath it read as two
           * unrelated logos rather than one lockup.
           */}
          <p className="text-soft-shadow text-center text-sm leading-relaxed font-medium text-white">
            Scan real plants. Battle them.
          </p>

          <div className="flex items-stretch gap-2">
            <Stat label="Plants" value={ready ? `${avatars.length}` : '—'} />
            <Stat label="Species" value={ready ? `${speciesCount}` : '—'} />
            {status === 'error' && <Stat label="Mode" value="Offline" />}
          </div>
        </div>

        {/* Scanning is the core loop, so it gets the widest tile and the largest target. */}
        <Link to="/scan" className="press pixel-panel pixel-panel-brand flex items-center gap-3 p-3">
          {/*
           * The Sprout mark — a seedling inside a camera aperture — is a literal
           * picture of what this tile does, so it replaces the camera icon here.
           */}
          <img
            src="/brand/sprout_mark_green.png"
            alt=""
            className="h-16 w-16 shrink-0 object-contain"
          />
          <span className="min-w-0">
            <span className="font-pixel text-sprout block text-sm">Scan</span>
            <span className="text-sprout/70 mt-1.5 block text-xs leading-snug">
              Turn a real plant into a Plantemon
            </span>
          </span>
          <span aria-hidden="true" className="font-pixel text-sprout/40 ml-auto shrink-0 text-sm">
            &gt;
          </span>
        </Link>

        <nav className="safe-bottom mt-3 grid grid-cols-2 gap-3">
          {destinations.map((destination) => (
            <Link
              key={destination.to}
              to={destination.to}
              className="press pixel-panel pixel-panel-brand flex flex-col items-center gap-1.5 p-3 text-center"
            >
              <img
                src={destination.icon}
                alt=""
                className="pixelated h-14 w-14 object-contain"
              />
              <span className="font-pixel text-sprout text-[11px]">{destination.label}</span>
              <span className="text-sprout/70 text-[11px] leading-snug">{destination.detail}</span>
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}

/** One progress chip: the value, with its unit underneath. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="pixel-panel pixel-panel-brand flex flex-col justify-center px-3 py-1.5 text-center">
      <span className="font-pixel text-sprout text-xs">{value}</span>
      <span className="text-sprout/60 mt-1 text-[9px] tracking-wide uppercase">{label}</span>
    </div>
  );
}
