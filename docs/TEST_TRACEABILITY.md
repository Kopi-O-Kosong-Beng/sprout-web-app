# Test Traceability — Use Cases → Sequence Diagrams → Suites

Every use case, the sequence diagram that specifies it, and the automated
suites that verify it — hyperlinked in both directions so a reader can start
from a requirement and arrive at the exact test file, or start from a failing
test and arrive at the scenario it protects.

**Integration strategy** (stated once, applied throughout): call-graph
**bottom-up** on the backend — repositories against the Firestore emulator
first, then services over them, then routes over those with Supertest — plus
**top-down caller-side** integration on the client, where React Testing Library
drives components against a mocked network boundary. End-to-end journeys sit
above both: a real Chromium drives the real client, server, and emulators with
nothing between the click and the database substituted.

Suite totals, measured from the runners on `main`, 2026-08-09: **603** server
Jest (44 files) · **309** client Vitest (28) · **149** pipeline Vitest (17) ·
**13** Playwright E2E (6). **1074 across 95 files.**

---

## UC1 — Signup

**Sequence diagram:** [UC1 signup](../obsidian-vault/_attachments/pm3-diagrams/UC1-signup-seq.png)

| Tier | Suite | What it verifies against the diagram |
|---|---|---|
| Integration (API) | [`server/tests/auth.test.ts`](../server/tests/auth.test.ts) | `POST /api/auth/signup`: validation failures, duplicate email, created account shape |
| Integration (API) | [`server/tests/auth.test.ts`](../server/tests/auth.test.ts) | `POST /api/auth/resend-verification`: link issue and resend limits (per-IP and per-account buckets) |
| Client | [`client/src/pages/SignupPage.test.tsx`](../client/src/pages/SignupPage.test.tsx) | Form validation, password criteria list, error rendering |
| Client | [`client/src/utils/validation.test.ts`](../client/src/utils/validation.test.ts) | The password policy itself, including the bcrypt 72-byte ceiling |
| **E2E** | [`e2e/signup-and-contact.spec.ts`](../e2e/signup-and-contact.spec.ts) | The main flow in a real browser against the **real endpoint** (Firebase Auth emulator): account genuinely created, success screen shown; plus the mismatch alternative flow |

## UC2 — Login

**Sequence diagram:** [UC2 login](../obsidian-vault/_attachments/pm3-diagrams/UC2-login-seq.png)

| Tier | Suite | What it verifies |
|---|---|---|
| Integration (API) | [`server/tests/auth.test.ts`](../server/tests/auth.test.ts) | `GET /api/auth/me` token verification, session login/logout, rejection of unverified and no-email tokens |
| Integration (API) | [`server/tests/auth-user-repo-firestore.test.ts`](../server/tests/auth-user-repo-firestore.test.ts) | Profile synchronisation on login |
| Client | [`client/src/pages/LoginPage.test.tsx`](../client/src/pages/LoginPage.test.tsx) | Form flows, the Google sign-in redirect race regression, audit-failure resilience |
| **E2E** | [`e2e/archive-to-battle.spec.ts`](../e2e/archive-to-battle.spec.ts) | Sign-in through the real form establishing a session (the dev-session path; the Firebase-token path is covered by the integration tier above) |
| Client (unit) | [`client/src/context/AuthContext.logout.test.tsx`](../client/src/context/AuthContext.logout.test.tsx) | `logout()` in isolation with Firebase mocked: audit-then-sign-out order, audit-failure resilience, the dev-session branch, unconfigured Firebase |
| **E2E** | [`e2e/logout.spec.ts`](../e2e/logout.spec.ts) | Sign-out as a round trip in a real browser — the header button is wired, the redirect happens, the stored session record is **removed** (jsdom's localStorage is a shim, so only this tier can tell), a protected route re-locks, and the state survives a reload. The server audit write is not exercised: the dev-session path returns before `POST /api/auth/session/logout`, which `auth.test.ts` owns |

## UC3 — Reset Password

**Sequence diagram:** [UC3 reset](../obsidian-vault/_attachments/pm3-diagrams/UC3-reset-password-seq.png)

| Tier | Suite | What it verifies |
|---|---|---|
| Integration (API) | [`server/tests/auth.test.ts`](../server/tests/auth.test.ts) | The reset OTP flow: anti-enumeration (generic 200), attempt limiting, atomic consume; policy itself in [`password-policy.test.ts`](../server/tests/password-policy.test.ts) |
| Client | [`client/src/pages/LoginPage.test.tsx`](../client/src/pages/LoginPage.test.tsx) | The reset request and OTP form flows |
| E2E | — deliberately not automated: the journey crosses an email inbox, which the stack does not emulate. Documented as a manual walkthrough in the report. |

## UC4 — Browse Avatar Archive

**Sequence diagram:** [UC4 archive](../obsidian-vault/_attachments/pm3-diagrams/UC4-archive-seq.png)

| Tier | Suite | What it verifies |
|---|---|---|
| Integration (repo) | [`server/tests/avatar-upsert.test.ts`](../server/tests/avatar-upsert.test.ts) | Per-user/species uniqueness, `lastSeenAt` stamping, temporary→persistent upgrade |
| Integration (API) | [`server/tests/avatar-api.test.ts`](../server/tests/avatar-api.test.ts) | Listing, detail fields (habitat, conservation), ownership checks |
| Integration (API) | [`server/tests/avatar-discovery-api.test.ts`](../server/tests/avatar-discovery-api.test.ts) | First-discoverer attribution |
| Client | [`client/src/pages/ArchivePage.test.tsx`](../client/src/pages/ArchivePage.test.tsx) | Rendering, filtering, sprite-failure fallback, detail panel |
| **E2E** | [`e2e/archive-to-battle.spec.ts`](../e2e/archive-to-battle.spec.ts) | The archive listing seeded creatures and the A3 "Battle with this avatar" shortcut into UC5 |

## UC5 — PVE Battle

**Sequence diagram:** [UC5 PVE](../obsidian-vault/_attachments/pm3-diagrams/UC5-pve-seq.png)

| Tier | Suite | What it verifies |
|---|---|---|
| Unit (engine) | [`server/tests/battle-engine.test.ts`](../server/tests/battle-engine.test.ts), [`battle-engine.property.test.ts`](../server/tests/battle-engine.property.test.ts) | Deterministic resolution, property-based invariants over the seeded RNG |
| Integration (repo) | [`server/tests/battle-repository.test.ts`](../server/tests/battle-repository.test.ts) | Transactional turn application, `expectedTurn` staleness, replay integrity on every read |
| Integration (API) | [`server/tests/battle-api.test.ts`](../server/tests/battle-api.test.ts) | Session lifecycle over HTTP, rewards, rate-limit budgets |
| Client | [`client/src/pages/BattlePage.test.tsx`](../client/src/pages/BattlePage.test.tsx) | Move disabled-reasons, double-submit locking, stale-turn sync, session resume, cinematic collapse under reduced motion |
| **E2E** | [`e2e/battle-turn.spec.ts`](../e2e/battle-turn.spec.ts) | A person starts a match and a committed move advances the server's own turn counter |

## UC6 — Upload Plant Picture (Scan)

**Sequence diagram:** [UC6 upload](../obsidian-vault/_attachments/pm3-diagrams/UC6-upload-seq.png)

| Tier | Suite | What it verifies |
|---|---|---|
| Unit (gate) | [`server/pipeline/__tests__/imageIngest.test.ts`](../server/pipeline/__tests__/imageIngest.test.ts) | Every rejection reason of the ingest gate, with literal boundary values |
| Robustness | [`server/pipeline/__tests__/imageIngest.fuzz.test.ts`](../server/pipeline/__tests__/imageIngest.fuzz.test.ts) | The mutation fuzzer against the same gate (see [`md/FUZZ_TESTING.md`](../md/FUZZ_TESTING.md)) |
| Unit (stages) | [`server/pipeline/__tests__/`](../server/pipeline/__tests__/) | Each of the six pipeline stages in isolation |
| Integration | [`server/tests/scan-persistence.test.ts`](../server/tests/scan-persistence.test.ts), [`sprite-storage.test.ts`](../server/tests/sprite-storage.test.ts) | The persist-on-complete path: record shape, canonical sprite, storage preconditions |
| Integration (API) | [`server/tests/pipeline-auth.test.ts`](../server/tests/pipeline-auth.test.ts), [`pipeline-complete-event.test.ts`](../server/tests/pipeline-complete-event.test.ts) | Route authentication; the resolved `complete` event contract the client renders |
| **E2E** | [`e2e/scan-to-archive.spec.ts`](../e2e/scan-to-archive.spec.ts) | The whole journey: a real photo through the real ingest gate and SSE stream, persisted through the **Storage emulator**, then found in the archive after navigation — the UC6→UC4 chain as one user experience |

## UC7 — PVP Battle

**Sequence diagrams:** [UC7a](../obsidian-vault/_attachments/pm3-diagrams/UC7a-pvp-seq.png), [UC7b failures](../obsidian-vault/_attachments/pm3-diagrams/UC7b-pvp-failures-seq.png)

Designed (diagrams above) and deliberately not implemented in the web build —
mobile-platform scope. No automated suite claims it; listed so the mapping is
complete rather than curated.

## UC8 — Submit Query Ticket

**Sequence diagram:** [UC8 query ticket](../obsidian-vault/_attachments/pm3-diagrams/UC8-query-ticket-seq.png)

| Tier | Suite | What it verifies |
|---|---|---|
| Integration (API) | [`server/tests/query.test.ts`](../server/tests/query.test.ts) + [`ticket-repo-firestore.test.ts`](../server/tests/ticket-repo-firestore.test.ts) | Persist-first ordering, independent submitter/admin notification outcomes, rate limiting |
| Client | [`client/src/pages/ContactPage.test.tsx`](../client/src/pages/ContactPage.test.tsx) | The documented field set, validation, success and failure rendering |
| **E2E** | [`e2e/signup-and-contact.spec.ts`](../e2e/signup-and-contact.spec.ts) | A visitor submits a ticket with no account and sees success feedback |

---

## Cross-cutting suites (not one use case's property)

| Concern | Suite |
|---|---|
| Authorisation matrix (401/403/200 grid, fail-closed allowlists) | [`server/tests/admin-api.test.ts`](../server/tests/admin-api.test.ts) |
| Leaderboard projections | [`server/tests/leaderboard*.test.ts`](../server/tests/) |
| Liveness/readiness split, graceful shutdown | [`server/tests/readiness.test.ts`](../server/tests/readiness.test.ts), [`lifecycle.test.ts`](../server/tests/lifecycle.test.ts) |
| Seed-URL ↔ disk sprite drift | [`server/pipeline/__tests__/spriteAssets.test.ts`](../server/pipeline/__tests__/spriteAssets.test.ts) |
| Public route posture (almanac open, everything else guarded) | [`e2e/public-access.spec.ts`](../e2e/public-access.spec.ts) |

## Honesty notes

- File names above are the stable anchors; counts move with development and are
  re-measured in [`obsidian-vault/05 Testing/Test Inventory 2026-08-06.md`](../obsidian-vault/05%20Testing/Test%20Inventory%202026-08-06.md).
- The E2E tier substitutes exactly one thing: the four paid third-party
  providers, via the server's own `USE_MOCK_APIS` fixtures. Firestore, Auth and
  Storage are Google's official emulators — the same client libraries and query
  semantics as production.
- UC3's inbox hop and UC7's implementation are the two places automation
  deliberately stops, and both are stated rather than glossed.
