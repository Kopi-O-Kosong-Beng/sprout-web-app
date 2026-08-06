---
tags: [project, competition, docker, cloud-native, final]
created: 2026-08-06
source: Kenny Lu email (forwarded by Justin 6 Aug), Justin Telegram 4-6 Aug 2026, prof consult 6 Aug 2026, Dell course ESDTFD04964 description
owner: Zhi Feng (containerization + cloud-native section), Justin (coordination)
status: active
---

# Dell Book Prize Competition

Separate track from the 50.003 grade, but **deliberately coupled to it**: the
shortlist is decided by the 1D final grade, so the best Dell strategy is the
ESC documentation itself. Cash prize + certificates. Open to all teams except
50.003x50.005 CoreStack teams.

## Dates

| Date | What | Owner |
|---|---|---|
| **10 Aug (Mon)** | Interest email to Kenny Lu + Prof Dileepa | Justin |
| **11 Aug (Tue)** | Submission shared during the final presentation: **Dockerfile + image** (optional ≤3-min demo video — Nat's backup video covers this) | Zhi Feng (artifacts) |
| **13 Aug (Wed)** | Top-3 shortlist announced — ranked by **1D final grade**, not by the Dell material | — |
| **14 Aug (Fri) 2-4pm** | Final pitch to Dell judges at the Dell office, shortlisted teams only. *Supersedes Kenny's email ("15 Aug"); Justin corrected on 6 Aug* | whole team |

## How it is actually decided

Two rounds, per the 6 Aug consult:

1. **Shortlist (the round that matters):** the 3 teams with the highest 1D
   final grade. The Dell-specific material is "mostly a checkbox"; profs
   "care more abt our ESC 1D parts to decide". **Every hour on the report is
   a Dell hour.**
2. **Final (14 Aug, Dell judges):** scored on five equal criteria —

| Criteria | 20% each | What we map to it |
|---|---|---|
| Business Value / Impact | | Andrina's intro: problem statement + impact (1 min of the preso) |
| Technical Competency | | **Prof clarified: this is the testing element** — CE10 docs, fuzzer, E2E. Directly transferable from 1D |
| Cloud Native Design and Architecture Rationale and Resiliency | | Zhi Feng's section (below) |
| Presentation | | Justin's confirmed preso structure |
| Beyond the Classroom / Out-of-Box Thinking | | Justin's conclusion slot; GenAI pipeline, replay-verified battle engine |

The final presentation on 11 Aug doubles as Dell evidence — the consult says
it **must mention Cloud Native + Test Suite**.

## Hard requirements (Kenny's email)

- Final product **deployed AND containerized**.
- Submission = **Dockerfile + image**, shared 11 Aug during the final preso.
- Team available 14 Aug 2-4pm.
- Judged partly against Dell's *Getting Up to Speed with Docker*
  (ESDTFD04964); Justin flags "Monolith vs Microservices" and "Container
  Orchestration with Kubernetes" as standout topics; extra complexity helps.

> [!warning] Decision reversal (2026-08-06)
> The 4 Aug decision was **report-only, no Dockerfile** — chosen when the ask
> was just a summary report. Kenny's email makes containerization a
> **submission requirement**, so that decision is superseded: a real
> Dockerfile + image must exist by 11 Aug. The 4 Aug report
> (`sprout-app/docs/dell-docker-report.md`, still untracked by git) keeps its
> architecture position but its SHIPPED/PROPOSED labels must be reworked once
> the artifacts land — a claim about "the Docker image we submitted" is only
> honest after the image is built.

## Containerization plan (Zhi Feng)

Ground truth 2026-08-06: **no Dockerfile exists anywhere in the repo** (only
vendored ones inside `node_modules/bcrypt`). Production is un-containerized:
Render `runtime: node`, Vercel serves `client/dist` statically.

Repo facts the plan builds on (verified against `origin/main`):

- npm workspaces monorepo (`server`, `client`), `engines.node: 22.x` — build
  context must be the repo root.
- Server binds `process.env.PORT ?? 3001` and exposes `GET /api/health` —
  ready-made for `EXPOSE`/`HEALTHCHECK`.
- Native modules `sharp` + `bcrypt` must compile for Linux in-image — the
  honest Windows-dev→Linux-prod reproducibility argument.
- Config is already 12-factor: everything via env vars
  (`render.yaml`/Vercel dashboards), secrets like
  `FIREBASE_SERVICE_ACCOUNT_JSON` injected at runtime, never baked in.
- Firestore emulator is a Java program (Temurin 21) — a compose service
  removes that per-laptop install.

Artifacts to build (in priority order):

1. **`server/Dockerfile`** — multi-stage: `node:22-slim` builder installs
   workspace deps + compiles TS; runtime stage copies the built server, runs
   non-root, `HEALTHCHECK` on `/api/health`. This is *the* submission
   artifact.
2. **`client/Dockerfile`** — stage 1 `npm run build` (Vite), stage 2 `nginx`
   serving `dist` with an API proxy. Completes the "product containerized"
   claim beyond just the API.
3. **`docker-compose.yml`** — client + server + Firestore-emulator (Java
   image) = the whole stack, offline, one command. Hits the course's
   "Running Multi-Containers with Docker-Compose" topic and genuinely solves
   team onboarding (Temurin, Node version, native builds).
4. **Image pushed to a registry** (GHCR under the org) — "Managing Docker
   Images with Registries" topic; gives Kenny a pullable image, not just a
   file.
5. *Stretch, label PROPOSED unless actually applied:* k8s manifests for the
   `server/pipeline/` extraction seam — keeps the modular-monolith position
   from the 4 Aug report ("containerise the seam, not the org chart") while
   ticking Justin's Kubernetes flag.

Deployment claim: keep Render on `runtime: node` for the 11 Aug demo (no
prod-risk before freeze); the product is *deployed* (Vercel+Render) and
*containerized* (Dockerfile + registry image, compose-verified locally).
Flipping Render to `runtime: docker` is a post-showcase option, not a
pre-freeze one.

## Cloud Native Design & Architecture Rationale and Resiliency (Zhi Feng + Justin)

One preso minute + a report subsection. Say only true things — all of these
are verifiable in the repo:

- **Architecture:** modular monolith on managed cloud services — static
  frontend on Vercel's CDN, stateless Express API on Render, identity/state
  delegated to Firebase Auth + Firestore + Storage. Monolith-vs-microservices
  rationale: one deployable for a 6-person team, with `server/pipeline/` as
  the one extraction seam that would earn its own container (CPU-bound
  `sharp`, 20 MB bodies, SSE long-lived connections, four external
  providers).
- **12-factor:** env-var config, build/release/run separation, stateless
  processes (any battle session replays from Firestore — no server memory to
  lose), dev-prod parity via the emulator + mocked providers.
- **Resiliency:** fail-closed auth allowlists; per-route rate limiting;
  fail-fast email with a fallback chain (console → SMTP → Resend HTTPS,
  chosen after Render's free tier blackholed SMTP); deterministic
  replay-verified battle engine (a crashed server loses nothing);
  `/api/health` probe; CI gates on every merge; free-tier cold-start
  awareness (warm before demos).
- **Container rationale (the honest version):** reproducible Linux builds of
  native modules across a Windows/mac dev team; the Java emulator packaged
  instead of hand-installed; the Jest 29/30 hoisting collision pinned away
  inside an image.

## Related

[[Final Deliverables Plan]] · [[Course Deliverables and Rubrics]] · [[Zhi Feng Task List]] · [[Testing Strategy]] · [[Open Questions and Inconsistencies]]
