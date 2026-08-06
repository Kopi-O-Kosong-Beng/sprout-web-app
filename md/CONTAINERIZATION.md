# Containerization and Cloud-Native Operation

What was built, how to run it, and — the part that matters for the report —
which claims are backed by something and which are not.

## One-Minute Summary

```text
server/Dockerfile              the API image. THE submission artefact.
client/Dockerfile              the frontend image (Vite build -> nginx).
client/nginx.conf              SPA routing, mirrors vercel.json.
docker/firestore-emulator/     the Java emulator, packaged.
docker-compose.yml             all three, one command, no secrets.
.dockerignore                  keeps credentials out of build layers.
.github/workflows/docker.yml   builds, runs and smoke-tests every image.

server/lifecycle.ts                    graceful shutdown (SIGTERM/SIGINT).
server/services/readiness.service.ts   dependency probes.
server/routes/health.routes.ts         GET /api/health/ready.
```

Quickest way to see it work:

```bash
docker compose up --build
# frontend  http://localhost:5173
# API       http://localhost:3001/api/health
# readiness http://localhost:3001/api/health/ready
```

## Why Containerize This Project

Four reasons, all specific to this repository. Generic ones were deliberately
left out — a judge can check these.

1. **Native modules cross an OS boundary.** `sharp` (libvips) and `bcrypt`
   compile to platform-specific binaries. The team develops on Windows and
   macOS; Render runs Linux. npm downloads a *different* prebuilt binary per
   machine, so a green suite locally has never been evidence about the binary
   production runs. Installing once inside Linux makes the Linux build the only
   build.
2. **The Firestore emulator is a Java program.** Every teammate has to install a
   JRE by hand, and nothing in `package.json` records that. `docker compose up`
   removes the step.
3. **An unpinned toolchain has already cost us.** The Jest 29/30 hoisting
   collision — a bare `jest` resolving to the wrong hoisted version under the
   emulator on Linux — is exactly the class of failure a pinned image prevents.
4. **The Dell Book Prize requires it.** "Make sure that your final product is
   deployed, and containerized."

## What Is Actually Verified

The Dockerfiles were authored on a Windows machine with **no Docker installed**,
so nothing here was built locally. That is stated rather than hidden, because
the argument for containerizing is that "works on my machine" is not evidence —
it would be incoherent to make that argument from an unbuilt image.

CI is therefore the verification path, and it is stronger than a local build
would have been: it runs on Linux, on every PR, and its result is a link.

| Claim | Verified by | Status |
|---|---|---|
| Graceful shutdown drains, bounds, and is idempotent | `server/tests/lifecycle.test.ts`, 5 cases | **PASS**, local |
| Readiness reports per-dependency status, times out, never throws | `server/tests/readiness.test.ts`, 10 cases | **PASS**, local |
| Liveness stays dependency-free | `readiness.test.ts` + a CI assertion with no credentials present | **PASS** |
| API image builds on Linux | `docker.yml` → `server-image` | **PASS** — 1m27s, 464 MB |
| Image runs as non-root | `docker.yml`, asserts `Config.User = node` | **PASS** — `configured user: 'node'` |
| Container answers `/api/health` with no credentials | `docker.yml` | **PASS** — healthy after 2s |
| Readiness reports per-dependency status without 500ing | `docker.yml` | **PASS** — `HTTP 503`, both probes named and `failed` |
| Container stops on SIGTERM in under 10s with exit code 0 | `docker.yml` | **PASS** — stopped in **1s**, exit 0, logged `drained cleanly` |
| Frontend image serves the shell and deep links | `docker.yml` → `client-image` | **PASS** — 24s |
| API and emulator talk over the compose network | `docker.yml` → `compose-stack`, asserts the firestore probe reports `ok` | **PASS** — 2m2s |
| Image published to GHCR | `docker.yml` → `publish`, on push to main | Pending — runs on merge |

All CI rows verified on run
[31097344997](https://github.com/Kopi-O-Kosong-Beng/sprout-web-app/actions/runs/31097344997),
commit `05fb060`, 6 Aug 2026.

**Not verified, and must not be claimed:** that the image runs on Render. The
production service is still `runtime: node` in `render.yaml` — the buildpack
path, not this image. Flipping it is a deliberate post-showcase change (see
below).

## The Liveness / Readiness Split

The single most important design decision here, and the one most likely to be
asked about.

- **`GET /api/health`** — *liveness*. Is this process running? Returns 200
  unconditionally, touches nothing. `render.yaml` names it as
  `healthCheckPath`, and both Dockerfiles use it for `HEALTHCHECK`.
- **`GET /api/health/ready`** — *readiness*. Can this instance serve? Probes
  Firestore and the Storage configuration. 200 when all probes pass, **503**
  when any fail. Nothing restarts on this route.

The tempting mistake is to make `/api/health` check Firestore so a broken
dependency stops traffic. It backfires: the platform restarts whatever fails its
health check, so one slow minute at Firestore would restart every instance at
once, and each replacement would fail the same check on boot — a dependency blip
amplified into a restart loop, with the restarts making recovery slower.

Kubernetes formalises this as `livenessProbe` vs `readinessProbe`. This is that
design without the cluster.

503 rather than 500 is also deliberate: the process is fine, a dependency is
not. 503 tells an orchestrator to route around this instance; 500 would suggest
the request was at fault and that a restart might help.

## Graceful Shutdown

Every platform stops this process the same way: SIGTERM, wait, SIGKILL. Render
does it on each redeploy; `docker stop` does it; a Kubernetes eviction does it.
Before `server/lifecycle.ts`, `server.ts` was `app.listen()` and nothing else,
so the default applied — immediate termination, dropping every in-flight
request.

Three rules, each a decision rather than a default:

1. **Stop accepting, then finish what is open.** `server.close()` closes the
   listener at once and calls back when existing connections end.
2. **Never drain forever.** A keep-alive connection that never closes would hold
   the container open until SIGKILL. A 10s timer bounds it and exits non-zero so
   the cause is visible in logs rather than looking like a healthy stop.
3. **Ignore repeat signals.** Platforms re-send SIGTERM and operators press
   Ctrl-C twice. A `settled` flag makes shutdown idempotent.

`CMD` uses exec form (`["node", "server/dist/server.js"]`) specifically so that
no shell sits at PID 1 swallowing the signal.

## Build and Run

Always build from the **repository root** — the root `package.json` declares the
workspaces, so an install run from `server/` cannot resolve the graph.

```bash
docker build -f server/Dockerfile -t sprout-server .
docker build -f client/Dockerfile -t sprout-client .

docker run --rm -p 3001:3001 \
  -e FIREBASE_STORAGE_BUCKET=sprout-dev-66f08.firebasestorage.app \
  -e FIREBASE_SERVICE_ACCOUNT_JSON="$(cat serviceAccountKey.json)" \
  sprout-server

curl localhost:3001/api/health
curl localhost:3001/api/health/ready | jq
```

Pull the published image instead of building:

```bash
docker pull ghcr.io/kopi-o-kosong-beng/sprout-web-app-server:latest
```

## Design Notes Worth Defending

**Debian slim, not Alpine.** Alpine is musl-libc; the prebuilt binaries npm
fetches for `sharp` and `bcrypt` target glibc, so an Alpine base silently
compiles from source or fails. Measured cost: **464 MB** (CI, 6 Aug 2026) —
larger than the "about 200 MB" first estimated here, and the estimate is
corrected rather than quietly dropped. Most of the weight is `firebase-admin`,
`google-gax` and libvips, none of which shrink on a different base, so the
honest lever for reducing it is trimming dependencies rather than switching to
Alpine and paying for a source build of `sharp` on every image. The frontend
image *does* use Alpine — nginx has no native Node modules to resolve, so the
smaller base is free there.

**Three stages in the API image.** `deps` resolves production dependencies only,
`builder` takes the full tree and compiles, `runtime` starts clean and copies one
artefact from each. Nothing that compiles code reaches the published image. The
split also lets the two build stages cache independently.

**`npm ci`, not `npm install`.** It installs exactly what `package-lock.json`
pins and fails when the lockfile and manifests disagree. That failure mode is
the point — a build that quietly resolves a different tree is not reproducible.
All three manifests are copied even though only one workspace is installed,
because `npm ci` verifies the lockfile against every workspace manifest.

**Non-root.** The `node` user (uid 1000) ships with the official image. A
compromised process starting as root inside the container is a materially worse
position for anything that then escapes. CI asserts this rather than trusting it.

**`VITE_*` are build arguments, not runtime environment.** Vite substitutes
`import.meta.env` at build time and writes literals into the emitted JavaScript.
A static bundle has no runtime environment, so a different configuration means a
different image. All the baked values are publishable — Firebase web config is
designed to reach browsers, and access is enforced by security rules and
server-side token verification. **No server secret is referenced in the
frontend image.**

**`.dockerignore` repeats every credential pattern from `.gitignore`.** Docker
does not read `.gitignore`, and a layer that once held a secret still holds it
after a later instruction deletes the file. Published images are public.

## 12-Factor Position

| Factor | State |
|---|---|
| III Config in the environment | Pass — `render.yaml` + Vercel; secrets `sync: false` |
| IV Backing services attached | Pass — swapping managed Firestore for the emulator is an env var |
| V Build/release/run separated | Pass — distinct build and start commands; now also image vs container |
| VI Stateless processes | Pass — all state in Firestore |
| VII Port binding | Pass — `process.env.PORT ?? 3001` |
| VIII Concurrency | Partial — stateless, so it holds; single instance today |
| **IX Disposability** | **Now pass** — was the one outright failure before `lifecycle.ts` |
| X Dev/prod parity | Pass — emulator + `USE_MOCK_APIS`; the compose stack strengthens this |
| XI Logs as event streams | Pass — stdout/stderr, platform captures |
| XII Admin processes | Pass — `seed:firestore`, `seed:admin`, `check:storage` as one-offs |

## Known Limits

Stated here so they are ours to name rather than a judge's to find.

- **Production still runs the buildpack**, not this image. `render.yaml` is
  `runtime: node`. Flipping to `runtime: docker` is a post-showcase change: the
  benefit is presentational, the risk lands on a live demo.
- **Single free-tier instance**, which sleeps. ~1 minute cold start, no
  redundancy. Warm it before any recording.
- **Rate-limit counters are in memory** (`express-rate-limit`'s `MemoryStore`),
  so they reset on restart and would not be shared across instances. Correct for
  one instance; horizontal scaling needs a shared store such as Redis.
- **No orchestration.** No Kubernetes, no autoscaling, no rolling deploys beyond
  what Render provides. `server/pipeline/` is the one seam that would justify
  its own container — CPU-bound `sharp`, 20 MB bodies, SSE, four third-party
  providers — and that remains a proposal, not a deployment.
- **No tracing or metrics.** Logs only; an outage is discovered from a user
  report.
- **The Storage readiness probe is config-only.** It checks that
  `FIREBASE_STORAGE_BUCKET` is set, not that the bucket answers. A live round
  trip would be stronger evidence but costs a Storage call on every probe.
- **The compose stack is not the production topology.** It substitutes a local
  emulator for managed Firestore, so it is a development and demonstration
  environment.

## Related

`md/DEPLOYMENT.md` · `md/FUZZ_TESTING.md` · `render.yaml` · `vercel.json` ·
`server/services/readiness.service.ts` · `server/lifecycle.ts`
