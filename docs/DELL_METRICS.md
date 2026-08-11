# Sprout — Operational Metrics

Measured figures for the Dell Book Prize technical discussion. Every number
below was read from CI logs, the git history, or a build run on `main` — none
is estimated. Where something could **not** be measured it says so rather than
guessing, because a figure a judge can check is worth more than one that sounds
good.

**Measured:** 2026-08-10, `main` @ `a57d07a` and later.
**Source of truth:** GitHub Actions runs on `Kopi-O-Kosong-Beng/sprout-web-app`.

---

## 1. The container

| Metric | Value | How it was measured |
|---|---|---|
| **Image size (uncompressed)** | **423 MB** | `docker image inspect --format '{{.Size}}'`, printed by every CI build |
| Size, three days earlier | 464 MB | Same step, run 6 Aug — **−41 MB (−8.8%)** from `.dockerignore` tightening and dependency pruning |
| Base image | `node:22-bookworm-slim` | `server/Dockerfile` |
| Build stages | **3** (`deps` → `builder` → `runtime`) | Nothing that compiles code reaches the published image |
| Dockerfile instructions | 29 | — |
| Runs as | **non-root** (`node`, uid 1000) | CI asserts `Config.User = node` on every build; the build fails otherwise |
| Secrets baked into the image | **0** | All configuration is injected at runtime; `.dockerignore` repeats every credential pattern from `.gitignore` because Docker does not read `.gitignore` |
| Registry | `ghcr.io/kopi-o-kosong-beng/sprout-web-app-server:latest` | Published on every push to `main`, tagged `latest` **and** the commit SHA |

> **Why 423 MB and not 80 MB.** `sharp` (libvips), `firebase-admin` and
> `google-gax` dominate the tree. Alpine was evaluated and rejected: it is
> musl-libc and the prebuilt binaries npm fetches for `sharp` and `bcrypt`
> target glibc, so an Alpine base silently compiles from source or fails. The
> honest lever for reducing size is trimming dependencies, not swapping the
> base and paying for a source build of `sharp` on every image.

**Not measured:** compressed pull size (the number that matters for network
transfer) and layer count — neither is exposed by the CI step and no Docker
daemon is available on the development machine. If asked, say so.

## 2. Build and delivery speed

| Metric | Value | Notes |
|---|---|---|
| **API image build + smoke test** | **37 s best / 158 s worst / ~90 s typical** | The spread *is* the cache signal — see below |
| Frontend image build + serve test | 28–74 s | Vite build → nginx |
| Compose stack (API + emulator, wired) | 115–126 s | Boots three services and asserts they talk |
| Publish to GHCR | 21–43 s | Layers already built; this is push time |
| **Whole container pipeline** | **152–245 s** (~3 min) | 4 jobs, largely parallel |
| Whole test pipeline | 171–218 s (~3 min) | Server + client + E2E |
| Frontend production build | **13.9 s** | `npm run build -w client` |

**Layer caching works and is quantified:** the same job runs in **37 s** when
the `npm ci` layer is a cache hit and **158 s** when a manifest change
invalidates it — a **4.3× difference**. That is why the Dockerfile copies
`package.json` + `package-lock.json` *before* the source: editing a `.ts` file
reuses the dependency layer instead of resolving the tree again.

## 3. Runtime behaviour

These are the numbers a platform engineer actually asks about — how fast it
comes up, how cleanly it goes down.

| Metric | Value | Why it matters |
|---|---|---|
| **Cold start to healthy** | **2 s** | Container start → `/api/health` answering 200. Asserted in CI on every build |
| **Graceful shutdown** | **0–1 s, exit code 0** | `docker stop` → SIGTERM → drain → clean exit, logging `drained cleanly`. Asserted in CI |
| Shutdown budget before force-exit | 10 s | A stuck keep-alive connection cannot hold the container open until SIGKILL |
| Readiness probe latency | 0–1 ms per dependency (unconfigured), ~2.4 s (live Firestore round trip) | Each probe independently timed out at 2.5 s |
| Liveness dependency count | **0** | Deliberate — see below |

> **The liveness/readiness split, and why it is worth a minute of the pitch.**
> `/api/health` answers 200 while touching nothing; `/api/health/ready` probes
> Firestore and Storage and answers **503** when a dependency is unusable.
> Combining them is the common mistake: the platform restarts whatever fails
> its health check, so one slow minute at the database would restart every
> instance at once and each replacement would fail the same check on boot — a
> dependency blip amplified into a restart loop. Kubernetes formalises this as
> `livenessProbe` vs `readinessProbe`; Sprout implements the design without
> needing the cluster.

**Not measured:** container memory footprint at rest, and Render's cold-start
time on the free tier (reported anecdotally as ~1 min after sleep, never
instrumented). Do not quote a number for either.

## 4. Pipeline reliability

| Metric | Value |
|---|---|
| **Container pipeline success rate** | **9/9 (100%)** — last 9 runs on `main` |
| **Test pipeline success rate** | **20/20 (100%)** — last 20 runs on `main` |
| Workflows | 3 — `tests.yml`, `docker.yml`, `fuzz-live.yml` |
| Secrets required by per-PR CI | **0** |
| Paid API calls made by per-PR CI | **0** |

> **Zero secrets is a design property, not an accident.** Firestore, Auth and
> Storage are Google's official emulators; the four paid providers are replaced
> by the server's own `USE_MOCK_APIS` fixtures. A suite that depends on a secret
> cannot run on a fork, skips silently when the secret is absent, and reports
> green for having done nothing. The one genuinely expensive job —
> `fuzz-live.yml`, which calls real providers — is `workflow_dispatch` only.

## 5. Delivery cadence

Thirty-two days of work by a five-person team, all through reviewed pull
requests on a protected `main`.

| Metric | Value |
|---|---|
| Project span | 2026-07-08 → 2026-08-09 (32 days) |
| Commits on `main` | **260** |
| Pull requests merged | **39** |
| Commits in the last 14 days | **163** (63% of all work) |
| **Mean lead time, PR open → merge** | **3.5 h** (last 12 PRs) |
| Median lead time | 2.65 h |
| Fastest / slowest | 0.2 h / 10.3 h |
| Deployment trigger | `autoDeployTrigger: commit` — every merge to `main` deploys |
| Contributors | 5 |

Every merge to `main` builds an image, publishes it to GHCR tagged with the
commit SHA, and triggers a production deploy. **Deployment frequency is
therefore equal to merge frequency: 39 deploys in 32 days.**

## 6. System scale

| Metric | Value |
|---|---|
| Source code (TS/TSX, excluding tests) | **31,839 lines** |
| Test code | **20,930 lines** — a 0.66:1 test-to-source ratio |
| Automated tests | **1,074 across 95 files** |
| API route handlers | 32 across 10 routers |
| Firestore collections | 5 (`users`, `avatar_records`, `query_tickets`, `password_history`, `counters`) |
| Production dependencies | 14 server, 9 client |
| Frontend bundle | 1,091 kB raw / **327 kB gzipped** JS; 94 kB / 17 kB CSS |

**Test breakdown** (measured from the runners, not by counting `it(` — they
differ by a third because parameterised cases expand at runtime):

| Suite | Files | Tests |
|---|---:|---:|
| Server integration & API (Jest + Firestore emulator) | 44 | 603 |
| Client components & routing (Vitest + RTL) | 28 | 309 |
| Pipeline, ingest gate & fuzzing (Vitest) | 17 | 149 |
| End-to-end journeys (Playwright, real stack) | 6 | 13 |
| **Total** | **95** | **1,074** |

## 7. Architecture position

**Modular monolith on managed cloud services** — one deployable, deliberately.

- Frontend: Vercel (static build, CDN)
- API: Render, running **our own image** (`runtime: docker`, confirmed in the
  dashboard) — not a buildpack we never saw
- Data: Firebase Auth + Firestore + Cloud Storage
- Infrastructure declared in `render.yaml` and `vercel.json`, reviewed like code

**The one extraction seam we would take first:** `server/pipeline/`. It is
CPU-bound (`sharp`), accepts 20 MB request bodies, holds SSE connections open,
and depends on four third-party providers — every reason a service gets its own
container and its own scaling policy. The rest of the application has none of
those properties, which is why it stays one deployable for a five-person team.

**12-factor position:** 10 of 12 satisfied before this workstream. Factor IX
(Disposability) was the one outright failure — the service had no signal
handling at all, so every redeploy dropped in-flight requests. Now fixed and
CI-asserted. Factor VIII (Concurrency) is partial: the app is stateless so it
*could* scale horizontally, but it runs one instance today.

## 8. Known limits — state these first

Naming a limit costs nothing; being caught not knowing it costs the room.

| Limit | Consequence | Why it was accepted |
|---|---|---|
| Single free-tier instance, sleeps when idle | Cold start after inactivity; no redundancy | Course project budget; warm before demos |
| Rate-limit counters in process memory | Per-instance; reset on restart; would need Redis at N>1 | Correct at one instance; the change is bounded and known |
| No tracing, metrics or alerting | An outage is learned from a user | Logs only; scoped out deliberately |
| No orchestration or autoscaling | Manual capacity | `server/pipeline/` is the seam that would justify it — proposal, not deployment |
| Email delivers to one address | Signup verification and reset OTP work, but only for one inbox | No purchased domain / MX configuration |
| Compressed image size unmeasured | Cannot quote pull-time cost | No Docker daemon on the dev machine; CI prints uncompressed only |

---

## The five numbers to memorise

If there is time for nothing else:

1. **423 MB** image, **non-root**, **zero baked secrets**
2. **2 s** cold start to healthy · **≤1 s** graceful shutdown, exit 0
3. **~3 min** full container pipeline · **37 s** on a warm cache (4.3× cache effect)
4. **100%** CI success across the last 29 runs · **0 secrets**, **0 paid calls** per PR
5. **39 deploys in 32 days**, mean lead time **3.5 h**, every one gated on **1,074 tests**
