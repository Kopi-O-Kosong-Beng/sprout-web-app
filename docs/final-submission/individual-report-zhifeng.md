# Individual Report — Chia Zhi Feng (1009327)

**50.003 Elements of Software Construction · Team Sprout (CH03, Team 02)**
Repository: https://github.com/Kopi-O-Kosong-Beng/sprout-web-app

My three roles in the final phase were backend and infrastructure owner, testing
lead alongside Nathaniel, and final reviewer and merger for every pull request
into `main`.

## 1. Contribution to requirement formulation and refinement

The use case model was Justin's and Andrina's. My contribution came from the
other direction: I built and deployed the system, and the requirements I refined
are the ones implementation proved wrong, under-specified, or unachievable.

**The UC6 → UC4 gap.** The scan pipeline produced a sprite, but nothing persisted
it into the player's archive, so the core loop — scan a plant, own it, battle
with it — did not exist end to end. Each use case was individually satisfiable
while the product did not work. I formulated the persistence requirements: what a
saved avatar record must carry (species, stats, sprite URL, capture source,
timestamps), and refined the **retention rule** — an in-real-life camera scan is
permanent, a web upload expires after 24 hours and drops out of battle
eligibility. That turned a vague "temporary uploads" idea into behaviour the
server enforces and a test can check (`server/services/cleanup.service.ts`).

**A requirement we could not meet, stated as a bound rather than dropped.** The
email requirement behind UC1, UC3, UC8 and UC16 assumed we could send to
arbitrary inboxes. Building it showed we could not — Resend delivers to arbitrary
recipients only from a verified domain, which means buying a domain and
configuring MX records. Rather than quietly claim the feature or cut it, I raised
the constraint and had it written into the report as an explicit bound: the path
works end to end for one address, and nowhere do we claim more. Three of the
sixteen use cases carry the "Delivered, bounded" stage for this reason
(Report §7, Table 28).

**Ranking, roles and security.** I specified the leaderboards as read-only
projections of battle and dex data, so a ranking can never disagree with the
records it summarises, and late in the project split a super-admin operator tier
from ordinary players. In UC3, the approved description replied "No account found
with this email address" to an unknown email, which lets an attacker enumerate
accounts; I changed it to one generic acknowledgement either way, with the
divergence from the sequence diagram documented rather than left silent.
Reproducible battle statistics, graceful shutdown on `SIGTERM` and the
liveness/readiness separation were likewise requirements that did not exist until
deployment demanded them, and are now in the twelve-factor audit (Report §4.1).

## 2. Contribution to the design

The class and sequence diagrams were owned by Andrina, Li Xiang and Omar. I owned
the design of the system's runtime, its authorisation model, and its test
architecture.

**Battle presentation architecture.** The battle server is a deterministic,
replay-verified engine whose stored sessions are re-simulated on every read. I
designed the client as a *presentation-only layer* over it: the UI derives turn
feedback from the server's own event log, never by diffing HP. That is what makes
guards, misses and heals attributable, and it lets the interface evolve — the
turn-by-turn cinematic added on 5 August — without touching engine numbers that
would invalidate stored sessions.

**Authorisation.** Two-tier allowlists — `ADMIN_EMAILS` as an advisory badge,
`SUPER_ADMIN_EMAILS` as the break-glass operator grant — enforced in Express
middleware on `/api/admin` and `/api/platform`, with the client's `isSuperAdmin`
flag advisory only. Fail-closed by construction: an unset list denies everyone.

**Persistence and transport.** Sprites are uploaded to Firebase Storage by the
server and the avatar record stores the durable URL; persistence is transactional
with dex and discovery updates, so a scan cannot half-save. For email I designed
`EMAIL_MODE` as a three-mode strategy, console → SMTP → HTTPS, after diagnosing
that Render's free tier silently blackholes outbound SMTP — so local development,
a self-hosted deployment and our actual host each have a supported transport.

**Cloud-native architecture and resiliency (Report §4).** I produced the
twelve-factor audit and designed the changes closing the gaps it exposed.
Disposability (Factor IX) was the one factor we outright failed; the response is a
shutdown handler (`server/lifecycle.ts`) that drains in-flight requests under a
bounded timer and is idempotent under repeated signals, plus a liveness/readiness
split answering two different questions.

**Test architecture.** I designed the tier structure and its integration strategy
— call-graph bottom-up on the backend (repositories against the Firestore
emulator, then services, then routes via Supertest), top-down caller-side on the
client — and the traceability mapping in `docs/TEST_TRACEABILITY.md`, linking
every use case to its sequence diagram and to the suites verifying it.

## 3. Contribution to the implementation

The subsystems I implemented:

| Subsystem | Where |
|---|---|
| Firestore data layer and repositories | `server/repositories/`, `services/auth.service.ts` |
| Email subsystem (verification, reset OTP, ticket notification) | `services/email.service.ts`, three-mode transport |
| Scan-to-archive persistence, UC6→UC4 | `services/scan-persistence.ts`, `sprite-storage.ts` (PR #8) |
| Leaderboards (XP, first discovery) | `services/leaderboard.service.ts`, `/leaderboard` (PR #10) |
| Battle client, turn cinematic, mid-battle session resume | `client/src/pages/BattlePage.tsx`, three iterations (PRs #10, #11) |
| Client auth hardening (Google redirect race, audit-failure tolerance) | `client/src/pages/LoginPage.tsx` (PR #11) |
| Super-admin operator tier, UC15 | `middleware/admin.middleware.ts`, route gating, nav visibility, route guards |
| Sprite asset pipeline completion | Demo species rendered through the real pipeline and committed, plus a drawn fallback |
| Design-system consistency pass | CTA contrast, shared ink/status tokens, focus rings, 44px touch targets |
| Containerization and cloud-native runtime | `server/Dockerfile`, `client/Dockerfile` + nginx, `docker-compose.yml`, `lifecycle.ts`, `readiness.service.ts` (PR #23) |
| Deployment | `render.yaml`, `vercel.json`, Vercel/Render/Firebase config; recovered the outages in Report §5.2 |
| CI and branch protection | `.github/workflows/docker.yml`, required checks on `main` |

## 4. Contribution to testing

Five kinds of test, plus the mapping tying them to the requirements.

**Integration tests against the Firestore emulator** (Jest + Supertest) rather
than mocks, so a query Firestore would reject fails in the suite too: the
scan-persistence and sprite-storage suites, the leaderboard API suite, and the
admin-API authorisation matrix extended to the super-admin tier — a 401/403/200
grid with fail-closed empty-allowlist cases, case-insensitive matching and
dev-bypass exclusion.

**Component and interaction tests** (Vitest + React Testing Library): battle-page
contract tests covering accessibility roles and names, the exact disabled-move
reasons, single-submit double-click locking, stale-turn synchronisation without
extra GETs, and session resume; archive rendering including the sprite-failure
fallback; nav visibility per role; route-guard redirects. Boundary and negative
cases are named as such — the bcrypt 72-byte password ceiling, timer cleanup and
repeat-signal behaviour on shutdown.

**Regression and drift-guard tests** — the Google sign-in redirect race, where I
had to iterate on the test itself until it genuinely failed without the fix (see
diary entry 2); and a filesystem assertion that fails the build if any seeded
sprite URL points at a file that does not exist
(`server/pipeline/__tests__/spriteAssets.test.ts`), written after that bug had
shipped twice with no test able to notice.

**System end-to-end tests** — the Playwright tier (`e2e/`, 6 specs, 13 journeys):
a real Chromium driving the real client, real Express and the Firestore, Auth and
Storage emulators, with nothing between the click and the database substituted,
on every pull request. I mutation-verified the sign-out journey by stubbing
`endDevSession()` to leave the session record in place: the header assertion
stayed green — React state had cleared, so the UI flipped exactly as a working
sign-out would — while the storage and reload assertions failed. That is how I
know the spec is evidence and not decoration.

I also wrote the input domain and data-type taxonomy (Report §6.4) and produced
the measured suite inventory, by running each runner and reading its own total
rather than grepping for `it(`, which understates the server suite by roughly a
third because parameterised cases expand at runtime. The fuzzer and the ingest
gate are Nathaniel's work.

## 5. AI hallucination diary

Dated cases where an AI assistant asserted something false, and what caught it.

1. **3 Aug — "the guard mechanic is broken."** The assistant diagnosed a
   battle-engine bug from a UI symptom. Reading the engine and its property tests
   showed the mechanic was correct; only the *display* misattributed guarded
   damage, and the fix was client-side. Lesson: symptom location is not defect
   location.

2. **3 Aug — a regression test that tested nothing.** The AI-written test for the
   sign-in redirect race passed both with and without the fix, because it never
   re-rendered the component, so the race never re-ran. I trusted it only after
   forcing a fresh JSX tree per assertion and watching it fail on the unfixed
   code. Lesson: a green test is evidence only if it was red first.

3. **5 Aug — "the user is in a Google session."** Both the assistant and I assumed
   an unverified admin account was Google-authenticated, because the console
   showed Google popup COOP noise. An Admin-SDK lookup showed the account had only
   the `password` provider — the popup had never completed, and the COOP messages
   were benign residue from an abandoned attempt. Lesson: check identity records,
   not console vibes.

4. **5 Aug — documentation as hallucination substrate.** The repo's own README
   described hand-made art in `client/public/plants/` that never existed. An
   earlier AI-assisted refactor had "fixed" the sprite URLs while trusting that
   description, so the bug survived the fix and every seeded plant rendered as an
   empty pot. Lesson: verify against the filesystem, then write a test that makes
   the assumption load-bearing — which is where the drift guard in §4 came from.

5. **August — the same failure one tier up.** Two generated end-to-end drafts
   could not fail: the first asserted the page was not blank, true of every route
   since they all render a layout; the second matched "PVE Battle", a navigation
   label in the header of every page. Entry 2's lesson had been learned at unit
   level and had to be relearned at journey level, so both drafts are kept in
   comments atop `e2e/archive-to-battle.spec.ts`.

The pattern: the assistant is most dangerous when it is *plausible*, and most
dangerous of all when what it produces is the **verification** rather than the
code. A hallucinated implementation gets caught by a test; a hallucinated test,
oracle or probe removes the thing that would have caught it, and the run stays
green. The counter-measures that worked were mechanical rather than
judgment-based: read the primary source, reproduce before fixing, red-green every
regression test, and turn any assumption that bit us into an automated check.

## 6. Reflection

I consider the project successful. All sixteen use cases are implemented and
reachable in the deployed build, the full loop works on the deployed stack, and
the suite is green across four tiers. Four things fall short: email delivery to
arbitrary inboxes is unproven; two operator pages carry no component test; three
flows have no automated journey, password reset being the one that matters, since
it is the only one that changes a credential; and the operator dashboards are
proven only negatively — the suite shows an unauthorised caller is refused
everywhere, not that an authorised operator can finish the task.

They have one cause between them. We deferred contact with everything we did not
control, whether that was the layer beneath us or the environment around us, and
every serious defect in this project lived in a seam we had deferred. Internally,
we repeatedly built UI above server capabilities that were not wired end to end:
the archive rendered empty pots for weeks because nothing verified the assets
existed, and battles resolved correctly long before a player could see *why*.
Externally, we validated against environments we owned. SMTP worked on our
machines and was blocked by the host. Vite stripped the quotes in our `.env`
while Vercel passed them through literally, so authentication passed every local
and CI check and failed only in production. In each case a green suite was not
evidence about production, because nothing in the suite had ever touched
production's constraints.

What I would change is the ordering, not the effort: deploy on day one to the
host we will actually use, against the providers we will actually pay for, and
let the environment reject us while the cost of being wrong is a configuration
change rather than a bounded requirement in a final report. The habit I take away
is integration ownership — somebody must continuously walk the product end to end
as a user rather than as a module author, and every confident claim, from a
teammate, a README, or an AI, is a hypothesis until a primary source or a failing
test confirms it.
