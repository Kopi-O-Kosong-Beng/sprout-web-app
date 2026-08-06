# 🌱 Sprout

**Scan a real plant. Get a creature. Battle with it.**

Sprout turns plant identification into a collection game. Photograph a plant, a
GenAI pipeline identifies the species and generates a pixel-art creature from it,
that creature persists in your archive with stats derived from the species, and
you can take it into turn-based battles and onto a public leaderboard.

Built for **50.003 Elements of Software Construction**, SUTD — Cohort 3, Team 2
(Kopi-O-Kosong-Beng).

**Live:** [sprout-web-app-jet.vercel.app](https://sprout-web-app-jet.vercel.app)

---

## What it does

| Feature | Description |
|---|---|
| **Scan → Archive** | Upload a plant photo; a six-stage pipeline identifies it, generates a sprite, removes the background, quantises to a fixed palette, and persists the result. Re-scanning a known species updates it rather than duplicating. |
| **Creature archive** | Every discovered species, with habitat, conservation status, and battle stats derived deterministically from the species name — so the same plant yields the same creature on every machine. |
| **PVE battles** | Turn-based combat against a fixed opponent with a seeded RNG. Sessions are stored as event logs and re-simulated on every read, so a server restart never corrupts a battle. |
| **Leaderboards** | XP and first-discovery rankings, computed as read-only projections so they cannot disagree with the records they summarise. |
| **Almanac** | A public reference of 200 Singapore flowering plants. |
| **Accounts** | Firebase Auth with email verification, password reset, and a fail-closed operator tier for admin tooling. |
| **Contact tickets** | Query submission with independent submitter and admin notification. |

## Architecture

```
┌──────────────┐        ┌──────────────┐        ┌──────────────────┐
│   React SPA  │  HTTPS │  Express API │        │  Firebase        │
│  Vite + TS   │───────▶│   Node + TS  │───────▶│  Auth · Firestore│
│   (Vercel)   │        │   (Render)   │        │  Storage         │
└──────────────┘        └──────┬───────┘        └──────────────────┘
                               │
                               ▼
                     ┌──────────────────────┐
                     │  GenAI pipeline      │
                     │  identify → prompt → │
                     │  generate → removeBg │
                     │  → finish → assemble │
                     └──────────────────────┘
```

**Modular monolith.** One deployable, with `server/pipeline/` as the single seam
that would justify extraction — it is CPU-bound, handles large request bodies,
holds SSE connections open, and depends on four third-party providers. The
reasoning is written up in [`md/CONTAINERIZATION.md`](md/CONTAINERIZATION.md).

**TypeScript throughout.** React + Vite on the frontend, Node + Express on the
backend, Cloud Firestore as the only datastore.

## Quick start

Requires **Node.js 22** and **Docker** (or a local JRE for the Firestore
emulator).

```bash
git clone https://github.com/Kopi-O-Kosong-Beng/sprout-web-app.git
cd sprout-web-app
docker compose up --build
```

That runs the whole stack — frontend, API, and a Firestore emulator — with no
credentials and no manual setup:

- Frontend → <http://localhost:5173>
- API health → <http://localhost:3001/api/health>
- API readiness → <http://localhost:3001/api/health/ready>

For local development without Docker, see
[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

## Testing

```bash
npm test                      # server + client
npm test -w server            # Jest (Firestore emulator) + Vitest (pipeline)
npm test -w client            # Vitest + React Testing Library
```

| Suite | Files | Tests | Tooling |
|---|---:|---:|---|
| Server integration & API | 40 | 565 | Jest + Supertest against the Firestore Emulator |
| Client components & routing | 26 | 265 | Vitest + React Testing Library |
| Pipeline & fuzzing | 13 | 113 | Vitest |
| End-to-end journeys | 2 | 6 | Playwright (Chromium) against the real stack |
| **Total** | **81** | **949** | |

Measured 2026-08-06 by running each suite, not by counting `it(` declarations —
parameterised cases expand at runtime, so a static count understates it.

Test design is documented in [`md/FUZZ_TESTING.md`](md/FUZZ_TESTING.md) (the
image ingest gate and its mutation fuzzer) and in the evidence records under
[`docs/`](docs/).

## Deployment

| Layer | Platform | Notes |
|---|---|---|
| Frontend | Vercel | Static build from `client/dist`, CDN-served |
| API | Render | Runs our own container image, built from [`server/Dockerfile`](server/Dockerfile) |
| Data | Firebase | Auth, Firestore, Cloud Storage |

Infrastructure is declarative — [`render.yaml`](render.yaml) and
[`vercel.json`](vercel.json) are the source of truth, and every secret is
injected at runtime rather than baked into an image.

The API image is published on every push to `main`:

```bash
docker pull ghcr.io/kopi-o-kosong-beng/sprout-web-app-server:latest
```

## Documentation

| Document | What it covers |
|---|---|
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Full local setup, seeding, troubleshooting |
| [`docs/COMMANDS.md`](docs/COMMANDS.md) | Every command in the repo |
| [`md/CONTAINERIZATION.md`](md/CONTAINERIZATION.md) | Container design, resiliency, 12-factor audit, known limits |
| [`md/FUZZ_TESTING.md`](md/FUZZ_TESTING.md) | Image ingest gate and the mutation fuzzer |
| [`md/DEPLOYMENT.md`](md/DEPLOYMENT.md) | Hosting, environment variables, CORS |
| [`md/DESIGN.md`](md/DESIGN.md) | Visual design system |
| [`md/requirements.md`](md/requirements.md) | Endpoint-level specification |
| [`md/checkoff.md`](md/checkoff.md) | Flow-by-flow walkthrough with file references |
| [`docs/`](docs/) | Verification evidence records and design specs |
| [`obsidian-vault/`](obsidian-vault/README.md) | **The decision record** — an Obsidian vault holding why each choice was made, with dated evidence labels |

The split is deliberate: the documents above explain *how* the system works,
[`obsidian-vault/`](obsidian-vault/README.md) explains *why* it is the way it is —
the arguments, the rejected alternatives, and the open questions.

## Repository layout

```
sprout-app/
├── client/          React + Vite frontend
├── server/          Express API
│   ├── pipeline/    GenAI sprite pipeline (six stages) + fuzz harness
│   ├── services/    Domain logic
│   ├── repositories/  Firestore access
│   └── tests/       Integration suites
├── docker/          Firestore emulator image
├── docs/            Development guides, specs, evidence records
├── md/              Feature and subsystem documentation
├── scripts/         One-off tooling and the E2E stack orchestrator
├── e2e/             Playwright end-to-end journeys
├── obsidian-vault/    Obsidian decision record (the "why")
├── render.yaml      Backend infrastructure (declarative)
├── vercel.json      Frontend hosting
└── docker-compose.yml
```

## Team

Cohort 3, Team 2 — Andrina, Justin, Li Xiang, Nathaniel, Omar, Zhi Feng.

---

*Academic project — 50.003 Elements of Software Construction, SUTD, 2026.*
