---
tags: [implementation, cloud-native, docker, resiliency, final, dell]
owner: Zhi Feng
created: 2026-08-06
status: active
branch: features/zhifeng/cloud-native-containerization
---

# Cloud Native and Containerization — Implementation Log

Work log for the containerization and resiliency workstream, written to be
lifted into the final report and the Dell pitch. Feeds:

- Final report — implementation subsystems, implementation challenges,
  deployment/architecture sections.
- Final presentation — the **Cloud Native Design and Architecture Rationale and
  Resiliency** minute (Zhi Feng + Justin), see [[Final Deliverables Plan]].
- Dell Book Prize criterion 3 of 5, 20% — see [[Dell Book Prize Competition]].

> [!important] Evidence discipline
> Every row in the tables below is labelled with what actually proved it.
> **Nothing here was built with Docker locally** — the machine has no Docker
> installed. CI builds and smoke-tests the images instead. Do not write "we
> containerized and deployed" in the report: production still runs the Render
> buildpack. See [[#Limits — state these before a judge finds them]].

---

## 1. What was built

Two halves. The first closes a real defect; the second is the submission
artefact.

### 1a. Resiliency gaps closed in the application

| Item | File | What it does |
|---|---|---|
| Graceful shutdown | `server/lifecycle.ts` (new), `server/server.ts` | Handles SIGTERM/SIGINT: stops accepting, drains open connections, bounded by a 10s timer, idempotent under repeat signals |
| Readiness probes | `server/services/readiness.service.ts` (new) | Runs dependency probes concurrently, each independently timed out, never throws |
| Readiness route | `server/routes/health.routes.ts` (new), `server/app.ts` | `GET /api/health/ready` → 200 ready / 503 not_ready, with per-dependency detail |

### 1b. Container artefacts

| Item | File |
|---|---|
| API image (3-stage, non-root, HEALTHCHECK) | `server/Dockerfile` |
| Frontend image (Vite build → nginx) | `client/Dockerfile` |
| SPA routing + caching, mirrors `vercel.json` | `client/nginx.conf` |
| Firestore emulator packaged (Node + JRE + firebase-tools) | `docker/firestore-emulator/` |
| Full stack, one command, zero secrets | `docker-compose.yml` |
| Credential and context exclusions | `.dockerignore` |
| Build + smoke test + GHCR publish | `.github/workflows/docker.yml` |
| Engineering documentation | `md/CONTAINERIZATION.md` |

---

## 2. The headline finding — we failed 12-factor IX

**Before this work, `server/server.ts` was seven lines: `app.listen()` and
nothing else.** No signal handling at all.

That matters because every platform that runs this process stops it the same
way — SIGTERM, grace period, SIGKILL. Render sends it on every redeploy,
`docker stop` sends it, a Kubernetes eviction sends it. With no handler, the
Node default applies: **immediate termination, dropping every in-flight
request.** A battle turn interrupted there loses its HTTP response even when the
Firestore transaction has already committed.

This is Factor IX (Disposability) of the twelve-factor methodology, and it was
the one factor the project outright failed. It is now the strongest
implementation-challenge entry in this workstream, because it has the shape the
rubric rewards: **a real defect, a named principle, a specific fix, and a test
that proves it.**

### Report phrasing (ready to paste)

> Sprout's API had no signal handling: `server.ts` called `app.listen()` and
> exited on the default SIGTERM behaviour. Because every container platform
> stops a process by sending SIGTERM and waiting, each redeploy terminated the
> service instantly and dropped requests still in flight. We addressed this by
> implementing a graceful shutdown handler that stops accepting new connections,
> drains open ones, bounds the drain with a ten-second timer so a keep-alive
> connection cannot hold the container open until SIGKILL, and is idempotent so
> repeated signals are safe. The container's `CMD` uses exec form specifically
> so no shell occupies PID 1 and swallows the signal. Five unit tests cover the
> clean drain, the forced-exit timeout, timer cleanup, repeat signals, and the
> close-error path; CI additionally asserts that a running container stops in
> under ten seconds with exit code 0 rather than being killed.

---

## 3. Liveness vs readiness — the design decision to defend

The most likely Q&A target. Get this right and it demonstrates architectural
judgement rather than tool familiarity.

| Endpoint | Question it answers | Behaviour | Wired to |
|---|---|---|---|
| `GET /api/health` | Is the process alive? | 200 always, touches nothing | `healthCheckPath` in `render.yaml`; `HEALTHCHECK` in both Dockerfiles |
| `GET /api/health/ready` | Can this instance serve? | 200 ready / **503** not_ready, per-dependency | Nothing. Deliberately. |

**Why liveness must stay shallow.** The obvious move is to make `/api/health`
check Firestore so a broken dependency stops traffic. It backfires: the platform
restarts whatever fails its health check, so one slow minute at Firestore would
restart every instance simultaneously, and each replacement would fail the same
check on boot. A dependency blip becomes a restart loop, and the restarts make
recovery slower.

**Why 503 and not 500.** The process is healthy; a dependency is not. 503 tells
an orchestrator to route around this instance. 500 would imply the request was
at fault and that restarting might help.

**The line for the pitch:** Kubernetes formalises this split as `livenessProbe`
vs `readinessProbe`. *We implemented the design without needing the cluster* —
which is a better answer to "why no Kubernetes?" than an unapplied YAML file.

Probes implemented: `firestore` (real `listCollections()` round trip — no
document, index or seed data required, so it behaves identically against the
emulator and production) and `storage_bucket_configured` (config-only; honestly
labelled as such).

---

## 4. Why containerize — the four project-specific arguments

Generic reasons were deliberately excluded. Each of these is checkable in the
repository, which is what makes them survive questioning.

1. **Native modules cross an OS boundary.** `sharp` (libvips) and `bcrypt`
   compile to platform-specific binaries. The team develops on Windows and
   macOS; Render runs Linux. npm downloads a *different* prebuilt binary per
   machine for the same dependency version — so a green local suite has never
   been evidence about the binary production executes. Building once inside
   Linux makes the Linux build the only build.
2. **The Firestore emulator is a Java program.** Every teammate installs a JRE
   by hand, and nothing in `package.json` records that this is a build
   dependency. `docker compose up` deletes the step.
3. **An unpinned toolchain already cost us.** The Jest 29/30 hoisting collision
   — a bare `jest` resolving to the wrong hoisted version under the emulator on
   Linux — is precisely what a pinned image prevents. We worked around it with
   an explicit `node node_modules/jest/bin/jest.js` path in CI.
4. **Dell requires it.** "Make sure that your final product is deployed, and
   containerized."

### The sharpest framing for the report

> Render already runs the service in a container built by its buildpack — we
> simply never authored, saw, or possessed that image. Containerization did not
> introduce containers to this project; it made the recipe ours, explicit,
> version-controlled, and reproducible off-platform.

---

## 5. Evidence table — what is proven and by what

| Claim | Proof | Status |
|---|---|---|
| Shutdown drains, bounds, clears its timer, is idempotent, handles close errors | `server/tests/lifecycle.test.ts`, 5 cases | **PASS (local, 6 Aug)** |
| Readiness reports every probe, times out a hung dependency, runs probes concurrently, never rejects, hides driver error text | `server/tests/readiness.test.ts`, 10 cases | **PASS (local, 6 Aug)** |
| Liveness stays dependency-free | `readiness.test.ts` + CI assertion with no credentials present | **PASS** |
| Readiness reaches the real emulator when mounted on the app | `readiness.test.ts` integration case | **PASS (local, 6 Aug)** |
| No regression across the server suite | `npx firebase emulators:exec --only firestore -- npx jest --runInBand` → **565 tests, 40 suites, all passing, 107.8s** | **PASS (local, 6 Aug)** |
| Client production build still succeeds (the frontend image depends on it) | `npm run build -w client` → built, 1.08 MB bundle / 325 kB gzip | **PASS (local, 6 Aug)** |
| API image builds on Linux | `docker.yml` → `server-image` | **PASS (CI, 6 Aug)** — 1m27s, **464 MB** |
| Image runs as non-root (`Config.User = node`) | `docker.yml` assertion | **PASS** — `configured user: 'node'` |
| Container serves `/api/health` with no credentials configured | `docker.yml` | **PASS** — healthy after 2s |
| Readiness reports per-dependency status and does not 500 | `docker.yml` | **PASS** — `HTTP 503`, both probes named and `failed` |
| Container stops on SIGTERM in <10s, exit code 0, logs "drained cleanly" | `docker.yml` | **PASS** — **stopped in 1s**, exit 0, `[lifecycle] drained cleanly` |
| Frontend image serves the shell and deep-links (`/archive` → 200) | `docker.yml` → `client-image` | **PASS** — 24s |
| API and emulator communicate over the compose network (firestore probe = `ok`) | `docker.yml` → `compose-stack` | **PASS** — 2m2s |
| Image published and pullable from GHCR | `docker.yml` → `publish`, run on main | **PASS (6 Aug)** — `ghcr.io/kopi-o-kosong-beng/sprout-web-app-server:latest`, digest `sha256:ae570668…`, also tagged `9b07301c…` |
| Production serves the new build | `GET /api/health/ready` on the live host returned 200 | **PASS (6 Aug, 12:18 UTC)** |
| Production dependencies healthy | live readiness: `firestore=ok` (2406 ms), `storage_bucket_configured=ok` (2086 ms), stable across repeated checks | **PASS** |
| Render builds from `server/Dockerfile` rather than the buildpack | Render dashboard shows `runtime: docker` — checked by Zhi Feng, 6 Aug | **PASS (CONFIRMED)** — production runs our own image. This sentence is now safe to write in the report and say to the judges. |

**Citable artefact:** CI run
[31097344997](https://github.com/Kopi-O-Kosong-Beng/sprout-web-app/actions/runs/31097344997),
commit `05fb060`, 6 Aug 2026 — all jobs green. This link is the evidence to put
in the report and show the Dell judges: the images are proven by a reproducible
Linux build, not by assertion.

**Correction on the record:** the image was first documented as "about 200 MB".
Measurement says **464 MB**. The estimate was wrong and is corrected rather than
quietly dropped — most of the weight is `firebase-admin`, `google-gax` and
libvips, none of which shrink on a different base image.

---

## 6. Implementation challenges (rubric-shaped)

The rubric awards full marks only when each challenge states **how it was
addressed**. Three from this workstream, each with a resolution.

**Engineering — the same dependency was three different binaries.** `sharp` and
`bcrypt` resolve to per-platform prebuilt binaries, so Windows, macOS and Linux
each ran a different compiled artefact under one version number, and local test
results were not evidence about production. *Addressed by* building the
dependency tree once inside a Debian-slim Linux image, pinned by
`package-lock.json` through `npm ci`. Alpine was evaluated and rejected: it is
musl-libc, and the prebuilds target glibc, so an Alpine base silently compiles
from source or fails.

**Engineering — the service ignored the only stop signal its platform sends.**
See §2. *Addressed by* `server/lifecycle.ts` plus exec-form `CMD`, with unit
tests and a CI assertion on real container stop time and exit code.

**Engineering — the readiness probe crashed the process it was probing, and only
the container build revealed it.** *(This is the strongest entry in this
workstream — a defect that every local test missed and CI caught.)* The first
`firestore` probe called `listCollections()` unconditionally. Firestore creates
its gRPC stub lazily, and google-gax's generated client attaches its own
`.catch(err => { throw err })` to that stub promise; when the credential lookup
fails, that rethrow becomes an **unhandled rejection on a promise our code never
holds a reference to**, and Node terminates on unhandled rejections by default.
So neither `await`, nor `.catch()`, nor the service's own error wrapper could
intercept it — a readiness endpoint that killed a healthy server, in exactly the
misconfigured-deploy scenario where someone would call it. Every local test
passed because the suite always runs against the emulator, which needs no
credentials. *Addressed by* detecting the unusable case before the call that
triggers it (the probe now checks that some credential source exists and reports
an ordinary failure when none does), plus a process-level unhandled-rejection
guard in `server.ts` as defence in depth — which logs and keeps serving, because
a rejection in a background client interrupted no request handler and all durable
state lives in Firestore. `uncaughtException` is deliberately left unhandled:
that one means the stack unwound mid-operation and should still end the process.

> **Why this is worth telling in the report and the pitch.** It is a concrete
> demonstration of the exact thesis behind containerising: the local suite was
> green, and the local suite was not evidence about production. The container
> build is what turned an invisible assumption into a visible crash.

**Testing — a probe that threw synchronously escaped its own error handler.**
The readiness service promised never to reject. The first implementation called
`probe.check()` and attached `.then(onOk, onFail)`; a probe throwing
*synchronously* threw before the handler was attached, escaped `runProbe`, and
rejected the entire `Promise.all`. **The test written for that contract failed
on the first run and caught it.** *Addressed by* invoking the probe inside an
async IIFE so a synchronous throw becomes a rejection the handler can observe.
Retained as a red-green record: the test was red for a real defect before it was
green.

> That last one is worth telling. It is concrete evidence of the red-green
> discipline claimed in the individual reports, and it happened during this
> workstream rather than being reconstructed afterwards.

---

## 7. Limits — state these before a judge finds them

- **Production still runs the Render buildpack**, `runtime: node`. The image is
  built, smoke-tested and published, but Render does not execute it. Flipping to
  `runtime: docker` is deliberately scheduled **after** the 11 Aug showcase (the
  11→14 Aug window) — the benefit is presentational, the risk lands on a live
  demo.
- **Single free-tier instance that sleeps.** ~1 min cold start, no redundancy.
  Warm it before any recording.
- **Rate-limit counters live in memory** (`express-rate-limit` `MemoryStore`) —
  they reset on restart and are not shared across instances. Correct for one
  instance; horizontal scaling needs Redis or equivalent.
- **No orchestration.** No Kubernetes, no autoscaling. `server/pipeline/` is the
  one seam that would justify its own container — CPU-bound `sharp`, 20 MB
  bodies, SSE, four third-party providers — and that stays a **proposal**.
- **No tracing or metrics.** Logs only; an outage is learned from a user.
- **The Storage readiness probe is config-only**, not a live bucket round trip.
- **The compose stack is not production topology** — it substitutes a local
  emulator for managed Firestore.

**Why naming these scores rather than costs:** the rubric awards full marks for
a challenge described with how it was addressed *or what alternative measure was
taken*. "Scoped out for a six-person team on free tier" is an alternative
measure. An unnamed gap is just a gap — and in Q&A, a pre-named weakness means
the question lands on ground we chose.

---

## 8. 12-factor audit — use this as the section's spine

An organizing framework beats a list of features; this *is* the "rationale" the
criterion asks for.

| Factor | State |
|---|---|
| III Config in environment | Pass — `render.yaml` + Vercel, secrets `sync: false` |
| IV Backing services attached | Pass — emulator vs managed Firestore is an env var |
| V Build/release/run separated | Pass — and now image vs container as well |
| VI Stateless processes | Pass — all state in Firestore |
| VII Port binding | Pass — `process.env.PORT ?? 3001` |
| VIII Concurrency | Partial — stateless so it holds; one instance today |
| **IX Disposability** | **Now pass** — was the single outright failure |
| X Dev/prod parity | Pass — emulator + `USE_MOCK_APIS`; compose strengthens it |
| XI Logs as event streams | Pass — stdout/stderr, platform captures |
| XII Admin processes | Pass — `seed:firestore`, `seed:admin`, `check:storage` |

---

## 9. Resiliency inventory (for the 1-minute slide)

Each with what it *demonstrates*, which is what a judge listens for:

| Property | Demonstrates |
|---|---|
| Stateless + all state in Firestore | Crash, restart and redeploy are non-events; horizontal scaling needs no redesign |
| Replay-verified battle engine (`assertBattleReplayIntegrity`, runs on **every** session read) | Correctness does not depend on process survival — state is recomputed from a log, not trusted from memory |
| Graceful shutdown | Deploys drain instead of dropping requests |
| Liveness/readiness split | A sick dependency routes traffic away instead of triggering restart loops |
| Fail-closed auth allowlists | Missing config locks everyone out rather than letting everyone in |
| Per-route rate limiting | One abusive client cannot exhaust a shared free tier |
| Image ingest gate + fuzzer | Protects paid Plant.id quota from malformed input |
| Email fallback chain (console → SMTP → Resend HTTPS) | **A real cloud constraint discovered in production** — Render blackholes outbound SMTP — diagnosed and re-architected |
| CI gates every merge | `autoDeployTrigger: commit` is only safe because broken code cannot reach main |
| Declarative `render.yaml` | Environment is version-controlled and reviewable; rebuild is a blueprint apply |

The email row is the best story: it is the only one where a limitation *of the
cloud platform itself* forced an architecture change. That is literally what
"cloud native design rationale" means.

---

## 10. Status and still open

**PR #23 merged to `main` (`9b07301`) on 2026-08-06.** All CI green, image
published to GHCR, production redeployed and healthy.

- [x] CI green; run link, image size and smoke-test values recorded in §5.
- [x] Email blueprint corrected — `render.yaml` said `EMAIL_MODE: smtp` while
      the dashboard had been switched to `resend` by hand. The blueprint is the
      declared source of truth, so the next sync would have pushed `smtp` back
      and email would have stopped delivering with nothing in the diff to
      explain it. `RESEND_API_KEY` and `RESEND_FROM` now declared `sync: false`.
- [x] `runtime: docker` applied (commit `1276a7a`, isolated so `git revert`
      undoes only this). Production came up healthy 2 minutes after merge.
- [x] **Render dashboard confirms `runtime: docker`** (checked 6 Aug). The claim
      "production runs our own container image" is verified end to end:
      Dockerfile in review → built and smoke-tested by CI → published to GHCR →
      running in production.
- [ ] Consider pinning the deployed image to the GHCR digest rather than
      rebuilding on Render, so the artefact judges pull is byte-identical to the
      one production runs.

## 11. Q&A answers, in plain English

The two questions most likely to come at us. Say them like this — no jargon, no
apologising for what we did not build.

### "Why didn't you use Kubernetes?"

**The short answer:** Kubernetes is software for automatically managing *many*
servers — restarting them, load-balancing between them, rolling out updates
across them. We run one server. It would be a traffic control system for a
single parking space.

**The part that makes it a good answer, not an excuse:** the *idea* Kubernetes
is built on, we did implement. Kubernetes insists on separating two different
questions — "is this server switched on?" and "can this server actually do its
job right now?" — because confusing them makes outages worse. We built both
checks, separately, for exactly that reason. So we took the design thinking
without the tool we do not need.

**If they push on when we *would* need it:** the sprite-generation pipeline is
the one part that would justify it — it does heavy image processing, holds long
connections open, and depends on four outside services. That is the piece we
would pull into its own container first. The rest of the app has no reason to be
split up.

### "Does it scale horizontally?" (= can you run several copies of the server?)

**Mostly yes, and the hard part is already done.** Our server remembers nothing
between requests — every piece of real data lives in Firestore. So you could
start five copies tomorrow and any copy could serve any user, with no work
needed. That property is the difficult one to retrofit, and we have it.

**The one honest exception, which we should say before they find it:** the limit
that stops someone spamming the signup form counts attempts in that server's own
memory. With five copies, each keeps its own count, so a determined person gets
five times the attempts. The fix is to move the counter into a shared store
(Redis). We did not, because we run one server and it would have been
infrastructure with no user today.

> Volunteering that exception is the point. It shows we know where the boundary
> is rather than claiming there isn't one.

## 12. Pullable artefact (for the Dell submission)

```bash
docker pull ghcr.io/kopi-o-kosong-beng/sprout-web-app-server:latest
```

Digest `sha256:ae570668c32f928e6a8317411579982b02022c7f36038f2865dd7e6dc230d19c`,
also tagged with commit `9b07301c…` so a claim in the report can point at the
exact image it refers to.

## Related

[[Dell Book Prize Competition]] · [[Final Deliverables Plan]] · [[Zhi Feng Task List]] · [[Open Questions and Inconsistencies]] · [[Testing Strategy]]
