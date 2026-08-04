import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

export default function ArchivePage() {
  const navigate = useNavigate();
  const demoToolsEnabled = import.meta.env.VITE_ENABLE_DEMO_TOOLS === 'true';
  const { avatars, status, error, demoEnabled, setDemoEnabled, retry } = useArchive();
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  const selected =
    avatars.find((avatar) => avatar.id === selectedAvatarId) ?? avatars[0] ?? null;
  const demoAction = demoEnabled ? 'Remove demo plants' : 'Add five demo plants';
  const settled = status === 'ready' || status === 'mutating';

  // Pad the final plank so a row of one or two still sits on a full shelf.
  const shelfCount = Math.max(1, Math.ceil(avatars.length / SLOTS_PER_SHELF));
  const shelves = Array.from({ length: shelfCount }, (_, row) =>
    Array.from(
      { length: SLOTS_PER_SHELF },
      (_, column) => avatars[row * SLOTS_PER_SHELF + column]
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

      <div className="safe-top flex items-center justify-between gap-2 px-3">
        <BackButton />
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
      </div>

      <div className="flex items-center justify-center gap-3 px-4">
        <img
          src="/img/ic_garden_header.png"
          alt=""
          className="pixelated h-16 w-16 object-contain sm:h-24 sm:w-24"
        />
        <h1 className="font-pixel text-outline text-xl text-white sm:text-3xl">Archive</h1>
      </div>

      {status === 'mutating' && (
        <p
          className="pixel-panel mx-auto mt-2 px-3 py-2 text-center text-[10px]"
          role="status"
          aria-label="Updating demo plants"
        >
          Updating demo plants...
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
        <div className="flex flex-1 items-center justify-center p-6" role="alert">
          <div className="pixel-panel w-full max-w-xs p-4 text-center">
            <h2 className="font-pixel text-xs leading-relaxed">Archive unavailable</h2>
            <p className="mt-2 text-[10px] leading-relaxed opacity-80">{error}</p>
            <button
              className="press pixel-button mt-4 w-full px-2 py-2 text-[9px]"
              type="button"
              onClick={retry}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {settled && avatars.length === 0 && (
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="pixel-panel w-full max-w-xs p-4 text-center text-xs leading-relaxed">
            No plants collected yet. Scan a plant to grow your first Plantemon.
          </p>
        </div>
      )}

      {settled && selected && (
        <div className="safe-bottom mx-auto w-full max-w-3xl px-2 pb-6">
          <div className="mt-2 flex flex-col gap-2">
            {shelves.map((plants, index) => (
              <Shelf
                key={index}
                plants={plants}
                selectedId={selected.id}
                onSelect={setSelectedAvatarId}
              />
            ))}
          </div>

          <SpecimenCard
            avatar={selected}
            busy={status === 'mutating'}
            onBattle={() =>
              navigate('/battle', {
                state: { avatarId: selected.id, avatar: selected },
              })
            }
          />
        </div>
      )}
    </main>
  );
}

/** One plank with three potted slots resting on it. */
function Shelf({
  plants,
  selectedId,
  onSelect,
}: {
  plants: (PlantAvatarData | undefined)[];
  selectedId: string;
  onSelect: (id: string) => void;
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
              aria-label={`Select ${avatar.name}${avatar.isDemo ? ' (Demo)' : ''}`}
              aria-pressed={avatar.id === selectedId}
              onClick={() => onSelect(avatar.id)}
              className="press flex w-1/3 flex-col items-center"
            >
              <span
                className={
                  avatar.id === selectedId
                    ? 'relative block rounded-full outline-3 outline-offset-2 outline-[color:var(--color-brand)]'
                    : 'relative block'
                }
              >
                <PlantAvatar avatar={avatar} />
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
  onBattle,
}: {
  avatar: PlantAvatarData;
  busy: boolean;
  onBattle: () => void;
}) {
  return (
    <div className="pixel-panel mt-4 p-4">
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        <div className="flex flex-col items-center gap-2">
          <PlantAvatar key={avatar.id} avatar={avatar} large />
          {/* Keyed so a failed load on one plant does not hide the next one's. */}
          <SpecimenPhoto key={avatar.id} avatar={avatar} />
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
