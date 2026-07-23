# Checkoff 3 Archive and PVE Verification Evidence

**Recorded:** 2026-07-23 (Asia/Singapore)

**Commit under test:** `7991254a7a10a69961b120dc8fe9f8a26327b1e8`

**First draft evidence artifact commit:** `d2cc497`

**Corrected grading/report evidence artifact commit:** `5bc87d` (contains the
split test taxonomy and testing timeline)

**Runtime used for the focused runs:** Node.js `v22.23.1`

## Scope and Claim Boundary

This document records focused UC4 archive and UC5 PVE evidence only. It does
not claim a broad application regression pass. The broad UC1-UC3 auth and UC8
Contact Us regression is supporting historical evidence and was intentionally
not rerun during this focused phase.

Firebase ID-token verification is mocked only at the Firebase Admin boundary.
Firestore repository, transaction, ownership, and HTTP integration tests use
the Firebase Firestore Emulator, not an in-memory repository and not the
production Firestore project.

The documentation-only update that created this file did not rerun tests. The
results below are the focused results already obtained for commit `7991254`.

## Core Focused Report Rows

The six focused command groups are non-overlapping. The report taxonomy below
separates unit/property, backend integration, frontend integration, and current
supporting hardening evidence. Together they contain **223 passing assertions
across 11 focused files**.

| Test ID | Use case | Strategy | Tool | Expected result | Actual result | Evidence path |
|---|---|---|---|---|---|---|
| CORE-U01 | UC4/UC5: determine server-authoritative avatar eligibility | Decomposition bottom-up unit testing; black-box expiry boundaries plus white-box eligibility branches | Jest | Collected avatars are eligible, temporary avatars are decided using server time, and the exact expiry boundary is rejected | PASS: 1 suite, 6/6 | `server/tests/battle-eligibility.test.ts` |
| CORE-I01 | UC4/UC5: read an owner-only archive and persist battle state/rewards in Firestore | Call-graph bottom-up backend integration; black-box ownership/boundary cases plus white-box transaction, concurrency, and replay paths | Jest, Supertest, Firestore Emulator | Archive list/detail responses remain owner-only and bounded; battle transactions advance once and apply terminal progression once | PASS: 2 suites, 96/96 | `server/tests/battle-repository.test.ts`; `server/tests/avatar-api.test.ts` |
| CORE-I02 | UC5: start, read, act on, abandon, and complete a PVE battle through HTTP | Call-graph bottom-up from engine/catalog to Firestore repository/transaction, service/controller/route, then black-box HTTP | Jest, Supertest, Firestore Emulator | Verified callers receive controlled public state; malformed, stale, foreign, and duplicate requests cannot corrupt or double-reward a session | PASS: 1 suite, 18/18 | `server/tests/battle-api.test.ts` |
| CORE-F01 | UC5: operate PVE through the real Battle page, router, and shared header | Top-down caller-side component integration with real page/router/components and mocked `sproutApi` | Vitest, React Testing Library, MemoryRouter | Roster/start/action/replay/abandon states render correctly and all real header/page navigation is locked only while non-idempotent start or replay is pending | PASS: 2 files, 28/28 | `client/src/pages/BattlePage.test.tsx`; `client/src/components/common/AppHeader.navigation-lock.test.tsx` |
| CORE-U02 | UC5: resolve deterministic PVE rounds and preserve battle invariants | Decomposition bottom-up unit/property testing; white-box branch, path, invariant, and generated-state cases | Jest, fast-check | Legal transitions preserve HP, energy, legal-move, terminal-state, immutability, and deterministic-replay invariants | PASS: 2 suites, 27/27 | `server/tests/battle-engine.test.ts`; `server/tests/battle-engine.property.test.ts` |
| CORE-I03 | UC4: enable and disable the exact owner-scoped demo archive set | Call-graph bottom-up repository/HTTP integration; black-box auth/outcome cases plus white-box collision, transaction-retry, and race paths | Jest, Supertest, Firestore Emulator | Demo enable/disable is exact, owner-scoped, idempotent, race-safe, and preserves collected records | PASS: 1 suite, 22/22 | `server/tests/avatar-demo.test.ts` |
| CORE-F02 | UC4: browse and mutate the archive through the real Archive page | Top-down caller-side component integration with real page/router/components and mocked `sproutApi`; black-box DOM/state cases | Vitest, React Testing Library, MemoryRouter | Loading, empty, pagination, demo mutation, retry, unmount, image fallback, and Archive-to-Battle handoff states match the public UI contract | PASS: 1 file, 14/14 | `client/src/pages/ArchivePage.test.tsx` |

Primary report rows should select the core use-case scenarios: eligibility,
owner-only archive reads, one-time Firestore battle transitions/rewards, PVE
HTTP behavior, Archive-to-Battle handoff, and pending-navigation locking.
Decoder rejection, retry/unmount behavior, responsive containment, and
accessibility hardening support those rows; they should not be presented as
separate headline use cases or used to inflate the total.

## Current Supporting Hardening

This current supporting row is included in the 223-test total but is not a
headline UC4/UC5 report claim.

| Test ID | Use case | Strategy | Tool | Expected result | Actual result | Evidence path |
|---|---|---|---|---|---|---|
| SUP-U01 | UC5 support: preserve the versioned battle catalog contract | Decomposition bottom-up unit testing; white-box compatibility and rejection branches | Jest | Stored `thornback-v1` data remains compatible while incomplete, forged, or unsupported move sets are rejected | PASS: 1 suite, 12/12 | `server/tests/battle-catalog.test.ts` |

## Focused Run Qualification

| Test ID | Use case | Strategy | Tool | Expected result | Actual result | Evidence path |
|---|---|---|---|---|---|---|
| QUAL-I01 | UC4/UC5: prior combined focused emulator setup | Combined focused backend integration setup | Jest, Supertest, Firestore Emulator | Every focused case completes within the configured setup timeout | 113/114 completed; one `beforeEach` exceeded the configured 15-second limit. This was a setup-timeout observation, not a demonstrated behavior defect. The isolated PVE HTTP API subsequently passed 18/18, and every named focused set above passed. | `server/tests/battle-api.test.ts`; `server/package.json` |

The isolated pass is the evidence for PVE HTTP behavior. The earlier combined
timeout must not be reported as a product defect or silently rewritten as a
114/114 combined pass.

## Recorded Focused Commands

The logical commands below were run from the indicated workspace under Node.js
`v22.23.1`. Firestore-backed sets use the emulator command directly so only the
named paths are selected.

From `server/`:

```powershell
npm exec -- jest --runInBand --runTestsByPath tests/battle-eligibility.test.ts tests/battle-catalog.test.ts
npm exec -- firebase emulators:exec --project sprout-test --only firestore "jest --runInBand --runTestsByPath tests/battle-repository.test.ts tests/avatar-api.test.ts"
npm exec -- firebase emulators:exec --project sprout-test --only firestore "jest --runInBand --runTestsByPath tests/battle-api.test.ts"
npm exec -- firebase emulators:exec --project sprout-test --only firestore "jest --runInBand --runTestsByPath tests/battle-engine.test.ts tests/battle-engine.property.test.ts tests/avatar-demo.test.ts"
```

From `client/`:

```powershell
npm exec -- vitest run src/pages/BattlePage.test.tsx src/components/common/AppHeader.navigation-lock.test.tsx
npm exec -- vitest run src/pages/ArchivePage.test.tsx
```

## Integration Strategy Definitions and Actual Order

**Decomposition top-down** starts with the highest-level subsystem and replaces
lower modules with stubs while moving downward through the static module tree.
**Decomposition bottom-up** starts with leaf utilities/modules and combines
them into larger static subsystems.

**Call-graph top-down** starts at a runtime caller and mocks its callees, then
progressively replaces those mocks. **Call-graph bottom-up** verifies runtime
callees first and then integrates their callers. **Call-graph pairwise**
isolates one caller-callee edge at a time.

The actual backend order is call-graph bottom-up:

```text
engine/catalog
-> Firestore repository/transaction
-> service/controller/route
-> HTTP
```

The React suites use top-down caller-side component integration: the real page,
router, and shared components render together while `sproutApi` is mocked at
the network boundary.

There is no claim of systematic pairwise coverage. Only selected caller-side
mocked boundary/outcome cases on the `page -> sproutApi` and
`auth -> Firebase verification` edges are isolated.

## Test Techniques

Black-box cases assert only public HTTP or DOM behavior. They cover equivalence
classes such as owned/foreign/missing resources, valid/invalid requests, and
eligible/ineligible avatars; boundary values such as page/page-size limits,
expiry instants, HP/energy bounds, and expected turns; and state transitions
such as loading/error/retry, active/terminal/abandoned battles, and navigation
lock acquire/release.

White-box cases are selected from implementation structure. They cover
branches and paths for malformed decoders, catalog compatibility, invalid
moves, stale/future turns, and missing profiles; invariants and fast-check
properties for HP, energy, legal moves, terminal state, immutability, and
deterministic replay; and concurrency/replay paths for duplicate actions,
Firestore transaction retries, and one-time rewards.

## Lifecycle and Supporting Regression

Sprout uses an iterative/agile lifecycle. UC4 archive and UC5 PVE are the
current progression increments. UC1-UC3 auth and UC8 Contact Us are supporting
regression evidence from an earlier phase. Planned system cases are derived
from the documented use cases rather than inferred from component tests.

| Test ID | Use case | Strategy | Tool | Expected result | Actual result | Evidence path |
|---|---|---|---|---|---|---|
| SUP-R01 | UC1-UC3/UC8: auth, password reset, and Contact Us regression | Iterative regression; black-box HTTP/DOM with selected branch/concurrency cases | Jest, Supertest, Vitest | Earlier auth/contact behavior remains traceable without being counted as current focused UC4/UC5 evidence | SUPPORTING HISTORICAL EVIDENCE ONLY; intentionally not rerun in this focused phase, so no current broad regression claim is made | `docs/checkoff3/auth-email-verification-evidence.md` |

## Planned / Not Run

| Test ID | Use case | Strategy | Tool | Expected result | Actual result | Evidence path |
|---|---|---|---|---|---|---|
| SYS-A01 | UC4: real-browser archive history behavior | Use-case-derived black-box browser system test | Playwright | Browser Back and Forward preserve a coherent archive/detail/battle navigation state | PLANNED / NOT RUN. JSDOM `beforeunload` coverage is not real-browser proof. | `client/src/pages/ArchivePage.test.tsx`; `client/src/components/common/AppHeader.navigation-lock.test.tsx` |
| SYS-P01 | UC4/UC5: full Archive-to-PVE journey | Use-case-derived black-box browser-to-backend system test | Playwright | A verified user loads Firestore archive records, starts PVE, completes/replays, and observes persisted progression through the live HTTP stack | PLANNED / NOT RUN | `05 Testing/Test Matrix.md`; `02 Requirements/UC4 Browse Avatar Archival.md`; `02 Requirements/UC5 PVE Battle.md` |
| SYS-F01 | UC1/UC2: live Firebase Auth and deployed configuration | Use-case-derived live system test | Playwright plus controlled Firebase account | Real sign-in, ID-token verification, authorized domain, and protected archive/PVE access work with deployed configuration | PLANNED / NOT RUN. Firebase verification is mocked only at the Admin boundary in current automated evidence. | `docs/checkoff3/auth-email-verification-evidence.md` |
| SYS-D01 | UC4/UC5: production Firestore persistence | Use-case-derived live datastore system test | Playwright/manual cloud inspection | Production rules/configuration preserve owner isolation and durable archive/battle progression | PLANNED / NOT RUN. Current Firestore integration evidence uses the emulator. | `docs/checkoff3/archive-pve-verification-evidence.md` |
| SYS-U01 | UC6/UC4: upload and AI pipeline to archive | Use-case-derived progression system test | Jest/Supertest plus Playwright/manual provider check | A valid upload completes identification, canonical processing/storage, and archive persistence without duplicate generation | PLANNED / NOT RUN. Current `avatar_records` archive evidence does not imply that the UC6 upload/AI pipeline exists. | `02 Requirements/UC6 Upload Plant Picture.md`; `05 Testing/Test Matrix.md` |

## Testing Tools and Scenarios

| Tool | Scenario | Current role |
|---|---|---|
| Jest | Backend unit, decoder, branch, repository, and service/route orchestration | Current focused evidence |
| fast-check | Generated battle states and invariant/property checks | Current focused evidence |
| Supertest | Black-box Express archive, demo, and PVE HTTP behavior | Current focused evidence |
| Firestore Emulator | Real Firestore query, transaction, ownership, concurrency, and replay semantics without production data | Current focused evidence |
| Vitest / React Testing Library / MemoryRouter | Real React page/router/shared-component integration with mocked `sproutApi` | Current focused evidence |
| Playwright | Real browser history and full browser-to-backend use-case journeys | Planned / not run |
| Postman / manual checks | Supplemental API demonstration, controlled inbox, deployed configuration, and cloud-console inspection | Supplemental only; not a substitute for automated or browser system evidence |

## Testing Timeline

| Date | Status | Testing milestone |
|---|---|---|
| 20 Jul | Completed | Requirements, UC4/UC5 scope, integration order, and evidence boundaries recorded |
| 21 Jul | Completed | Auth/email evidence retained as supporting historical regression; Firebase Storage Admin bucket preflight passed |
| 22 Jul | Completed | Firestore-only archive/PVE increment established and active SQLite runtime removed |
| 23 Jul | Completed | Six focused command groups passed 223 assertions across 11 files at commit `7991254`; broad regression was not run |
| 23 Jul | Completed | Unit, backend integration, frontend integration, qualification, tools, and planned-system report rows synchronized |
| 24 Jul | Planned / not run | Real-browser Back/Forward and full browser-to-backend Archive-to-PVE system checks |
| 25 Jul | Planned / not run | Use case -> sequence -> code -> test -> screenshot/video traceability; live Firebase Auth/config and production Firestore only if a controlled environment is available |
| 26 Jul | Planned / not run | PM3 evidence freeze, review, rehearsal, and explicit disclosure of every unexecuted live/system case |

UC6 upload, identification, AI processing, canonical Storage integration, and
upload-to-archive provenance remain a **PLANNED TARGET / NOT RUN**. The current
archive records and Firebase Storage Admin preflight do not prove that flow.
