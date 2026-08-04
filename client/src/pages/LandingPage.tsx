import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

/**
 * Public landing page — the marketing overview at /, one step before the game.
 *
 * Ported from plantemon-web's app/page.tsx. Clerk's <Show when="signed-in"> is
 * replaced by the Firebase auth status this app already carries, and
 * next/image / next/link by plain <img> and react-router <Link>.
 *
 * Unlike the game screens this is a normal scrolling document, so it does not
 * use .screen — that class pins to 100dvh and clips overflow, which is right
 * for a fixed game board and wrong for a page with sections below the fold.
 */

/** The core loop, in the order a new player meets it. */
const STEPS = [
  {
    n: '01',
    title: 'Scan',
    art: '/img/ic_nav_camera.png',
    body: 'Point your camera at any plant. Sprout identifies the species and pulls its real botanical record — light, soil, watering, toxicity.',
  },
  {
    n: '02',
    title: 'Grow',
    art: '/img/ic_nav_garden.png',
    body: 'An AI renders that species as a pixel-art creature and plants it on your shelf. Every sprite is unique to the plant you scanned.',
  },
  {
    n: '03',
    title: 'Battle',
    art: '/img/ic_nav_adventure.png',
    body: "Moves come from the plant's actual taxonomic class — mosses, ferns, conifers and flowering plants each fight differently. Then take it to a turn-based match.",
  },
];

const FEATURES = [
  {
    title: 'Real species, real data',
    body: "Every creature is backed by the plant's botanical record: scientific name, family, habitat, conservation status, and battle stats drawn from its own botany.",
  },
  {
    title: 'Sprites generated per plant',
    body: 'A language model describes your plant as a creature, and an image model renders it as a 192×192 sprite. No two archives look alike.',
  },
  {
    title: 'Taxonomy-driven movesets',
    body: 'A decision tree maps the real taxonomic class onto a move pool, so a fern and a conifer genuinely play differently.',
  },
  {
    title: 'Built on a real pipeline',
    body: 'Identification, prompt crafting, rendering, background cutout and palette quantisation each run as their own hop — with a live studio to watch them resolve.',
  },
];

export default function LandingPage() {
  const { status } = useAuth();
  // 'unverified' is a real session — sending those users to sign up again would
  // be a dead end, so anything but signed-out gets the app entry point.
  const signedIn = status === 'authenticated' || status === 'unverified';

  return (
    <div className="bg-sprout min-h-full text-white">
      {/* ---------- Hero ---------- */}
      <section className="relative isolate overflow-hidden">
        <img
          src="/img/bg_home.jpg"
          alt=""
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
        {/*
         * Scrim: enough to hold white copy, not so much that the painted scene
         * flattens into a plain green field. Solid at the foot so the section
         * below joins onto it seamlessly.
         */}
        <div className="from-sprout/70 via-sprout/60 to-sprout absolute inset-0 -z-10 bg-gradient-to-b" />

        <div className="mx-auto max-w-4xl px-6 py-20 text-center sm:py-28">
          <img
            src="/brand/sprout_wordmark_white.png"
            alt="Sprout"
            className="mx-auto h-auto w-[min(280px,64vw)] drop-shadow-[0_3px_16px_rgba(0,0,0,0.55)]"
          />

          <h1 className="mt-8 text-3xl leading-tight font-semibold text-balance sm:text-5xl">
            Turn the plants around you into creatures that fight.
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/75 sm:text-lg">
            Point your camera at any plant. Sprout identifies the species, renders it as a
            pixel-art creature, and gives it a moveset drawn from its real botanical taxonomy.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {signedIn ? (
              <Link to="/home" className="press pixel-button w-full px-6 py-4 text-[10px] sm:w-auto">
                Open Sprout
              </Link>
            ) : (
              <>
                <Link
                  to="/signup"
                  className="press pixel-button w-full px-6 py-4 text-[10px] sm:w-auto"
                >
                  Start scanning
                </Link>
                <Link
                  to="/login"
                  className="press pixel-button pixel-panel-dark w-full px-6 py-4 text-[10px] sm:w-auto"
                >
                  I have an account
                </Link>
              </>
            )}
          </div>

          <p className="mt-6 text-xs text-white/50">
            Free to play. Installs to your home screen as an app.
          </p>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <SectionHeading eyebrow="How it works" title="Three steps, one plant." />

        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.n} className="pixel-panel-dark flex flex-col p-6">
              <div className="flex items-center gap-4">
                <img
                  src={step.art}
                  alt=""
                  className="pixelated h-16 w-16 shrink-0 object-contain"
                />
                <span className="font-pixel text-2xl text-white/25">{step.n}</span>
              </div>
              <h3 className="font-pixel mt-5 text-sm">{step.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-white/70">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- Features ---------- */}
      <section className="border-y border-white/10 bg-black/15">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
          <SectionHeading
            eyebrow="What's under it"
            title="It's a real plant identifier wearing a game."
          />

          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="pixel-panel-dark p-6">
                {/*
                  text-white is not redundant. `--color-base` is declared in
                  @theme (index.css), so Tailwind generates a `text-base`
                  *colour* utility that collides with the built-in `text-base`
                  font size — and this heading was being painted #0c082a,
                  near-black on the dark green panel. Stating the colour wins.
                */}
                <h3 className="text-base font-semibold text-white">{feature.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-white/70">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Closing call to action ---------- */}
      <section className="relative isolate overflow-hidden">
        <img
          src="/img/bg_garden.jpeg"
          alt=""
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
        <div className="from-sprout via-sprout/65 to-sprout absolute inset-0 -z-10 bg-gradient-to-b" />

        <div className="mx-auto max-w-3xl px-6 py-20 text-center sm:py-24">
          <img
            src="/brand/sprout_mark_white.png"
            alt=""
            className="mx-auto h-16 w-16 object-contain opacity-90"
          />
          <h2 className="mt-6 text-2xl leading-tight font-semibold text-balance sm:text-4xl">
            There&apos;s a plant within arm&apos;s reach. Go scan it.
          </h2>
          <div className="mt-8 flex justify-center">
            <Link
              to={signedIn ? '/home' : '/signup'}
              className="press pixel-button px-6 py-4 text-[10px]"
            >
              {signedIn ? 'Open Sprout' : 'Create your archive'}
            </Link>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row">
          <img
            src="/brand/sprout_wordmark_white.png"
            alt="Sprout"
            className="h-auto w-24 opacity-70"
          />
          <p className="text-xs text-white/45">Scan real plants. Battle them.</p>
        </div>
      </footer>
    </div>
  );
}
/** Eyebrow label above a section title — the pixel font's job on this page. */
function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="max-w-2xl">
      <p className="font-pixel text-[10px] tracking-wide text-white/40 uppercase">{eyebrow}</p>
      <h2 className="mt-4 text-2xl leading-tight font-semibold text-balance sm:text-4xl">
        {title}
      </h2>
    </div>
  );
}
