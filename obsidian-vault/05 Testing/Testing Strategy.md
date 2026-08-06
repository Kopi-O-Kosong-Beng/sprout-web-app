---
tags: [testing, checkoff3, final, integration, sdlc]
source: SoftwareTest.pdf, BlackboxUnitTest.pdf, Week10A_1.pdf, Week10A_2.pdf, PM3 rubric, CE10 homework, meeting 2026-07-30
updated: 2026-08-01
---

# Testing Strategy

Testing is a first-class Checkoff 3 deliverable: table-form plan, justified integration order, running framework tests, schedule, ownership, and evidence tied to use cases.

## Final-report documentation requirements (added 2026-07-30)

The PM3 video identified test objectives well but the suite was **not
reproducible from the report alone**. The final report must close that gap.

### Every test case uses the CE10 format

A "unit" is a single class or component in the architecture - the UI, the
Controller, the Service. For every test case state explicitly:

| Field | Meaning |
|---|---|
| Target Unit | the subject under test |
| Test Name / Scenario | what behaviour is being exercised |
| Inputs | the data the test passes into the unit |
| Expected Outputs | what the unit returns, or the state change it makes |
| Mocked Input/Output pairs | which dependencies are mocked, what fake data they receive, and what fake data they return |

### Concrete values and input domains

- **Concrete values for every case.** Representative examples go in the main
  report body; the full value set goes in an appendix. Do not leave placeholder
  descriptions where a literal value belongs.
- **Specify the domain (range) and data type of every input** - for example
  "integer, 1..999" or "string, 1..2048 UTF-8 code points". This is what lets a
  reader derive the equivalence classes and boundaries and reproduce the suite.

### Mock the AI pipeline

Frontend and UI/UX flows are tested against a **mock layer or HTTP network
responder** standing in for the generation pipeline, so that no paid generation
call is made during development or CI. The pipeline is deliberately split into
discrete stages (`identify -> promptCraft -> generate -> removeBg -> finish ->
assemble`) so a failure isolates to one segment rather than to the whole
sequence. Disclose the mock boundary wherever mocked results are reported.

### CI budget policy

Unit tests and mocked integration tests run **on every commit**. End-to-end runs
are **on demand**, not on every pull request, because automated browser testing
is resource-intensive on a free-tier account.

## Lifecycle strategy

Sprout follows an **iterative/agile lifecycle**. Each iteration moves from user
story and use-case refinement through analysis/design, code, unit tests,
integration tests, and regression.

- **Progression testing:** UC4 archive-record browsing/demo controls and UC5 PVE
  are the current tested increments. UC6 upload/identification/AI processing
  remains planned and is not implied by the archive evidence.
- **Regression testing:** UC1-UC3 auth and UC8 ticket behavior are supporting
  historical evidence. They were intentionally not rerun in the current
  focused UC4/UC5 phase.
- **System testing:** planned cases are derived from use-case documents,
  sequences, and state machines.

This wording directly answers Justin's request to discuss testing strategies employed for the software development lifecycle.

## Integration strategy definitions and decision

**Decomposition top-down** starts with the highest-level subsystem, substitutes
lower modules with stubs, and moves downward through the static module tree.
**Decomposition bottom-up** verifies leaf utilities/modules first, then
combines them into larger static subsystems.

**Call-graph top-down** starts at a runtime caller with mocked callees and
progressively replaces those mocks. **Call-graph bottom-up** verifies runtime
callees first and then integrates their callers. **Call-graph pairwise**
isolates one caller-callee edge at a time.

### Actual backend order: call-graph bottom-up

The focused backend integration follows this runtime order:

```text
engine/catalog
-> Firestore repository/transaction
-> service/controller/route
-> HTTP
```

Why it fits:

- Pure battle rules and catalog compatibility are known before transaction
  behavior is exercised.
- Firestore repository, ownership, concurrency, retry, and replay behavior is
  known before service/controller/route behavior is asserted through HTTP.
- The order maps runtime sequence messages to focused evidence without claiming
  that the whole browser system has run.

### Actual React order: caller-side top-down

The React suites render the real Archive/Battle page, MemoryRouter, and shared
components together while mocking `sproutApi` at the network boundary. This is
top-down caller-side component integration: page orchestration and its direct
API edge are tested before a full live backend/browser journey.

### Selected isolated edges, not systematic pairwise coverage

There is no claim of systematic call-graph pairwise coverage across every
caller-callee combination. Only selected mocked boundary/outcome cases on the
caller-side `page -> sproutApi` and `auth -> Firebase verification` edges are
isolated. UC6 provider edges remain planned with the upload/AI pipeline.

### Why decomposition is not primary

A decomposition tree describes static module ownership, while the current
backend risks are interactions across engine, persistence, service, and HTTP
calls. Decomposition bottom-up is still useful for pure engine/catalog tests.
The backend integration claim is specifically call-graph bottom-up.

## Testing tools and scenarios

| Tool | Scenario | Current role |
|---|---|---|
| Jest | Backend unit, decoder, branch, repository, and service/route orchestration | Current focused evidence |
| fast-check | Generated battle states and invariant/property checks | Current focused evidence |
| Supertest | Black-box Express archive, demo, and PVE HTTP behavior | Current focused evidence |
| Firestore Emulator | Real Firestore query, transaction, ownership, concurrency, and replay semantics without production data | Current focused evidence |
| Vitest / React Testing Library / MemoryRouter | Real React page/router/shared-component integration with mocked `sproutApi` | Current focused evidence |
| Playwright | Real browser history and full browser-to-backend use-case journeys | **Installed and running as of 2026-08-06** (PR #24). 11 specs across 5 files driving a real Chromium against the real React build, real Express and the Firestore emulator. Runs on every pull request — it needs no secret, because Firestore is the emulator, `USE_MOCK_APIS` replaces all four paid providers, and `AUTH_DEV_BYPASS` supplies the identity. `npm run test:e2e` |
| GitHub Actions | Continuous regression: the six focused command groups re-run on every pull request to `main`, push to `main`, and manual dispatch (`.github/workflows/tests.yml`, commit `89d6e3f`; Firestore Emulator via Java, no secrets) | Implemented on `feat/checkoff3-auth-email`; first cloud run occurs when the branch is pushed/PR opened |
| Postman / manual checks | Supplemental API demo, controlled inbox, deployed configuration, and cloud-console inspection | Supplemental only; not a substitute for framework or browser system tests |

Firebase ID-token verification is mocked only at the Firebase Admin boundary.
Firestore integration uses the emulator. Neither proves live Firebase Auth
configuration or production Firestore rules/data.

## Black-box and white-box techniques

**Black-box HTTP/DOM cases** assert public behavior without inspecting internal
state. Equivalence classes include owned/foreign/missing resources,
valid/invalid requests, and eligible/ineligible avatars. Boundary cases include
pagination, expiry instants, expected turns, HP, and energy. State cases include
loading/error/retry, active/terminal/abandoned battles, demo mutation, and
navigation-lock acquire/release.

**White-box cases** are selected from code structure. Branch/path cases cover
catalog/decoder rejection, stale/future turns, invalid moves, missing profiles,
and retry/unmount paths. Invariant/property cases cover HP, energy, legal moves,
terminal state, immutability, and seeded replay. Concurrency/replay cases cover
duplicate actions, Firestore transaction callback retries, and one-time
progression.

## Unit priorities

### Upload/canonical sprite

These UC6 items remain planned:

- Empty, malformed, wrong-magic-byte, accepted-format, exact 5 MB, and over-limit images.
- Confidence below/at/above configured threshold.
- Quantizer output 56x56, palette closure, alpha preservation, deterministic checksum.
- Recipe-key determinism, cache hit, first-writer lock, concurrent loser reuse, expired-lock recovery.
- `VISITED` upsert, repeated scan, and mobile-only promotion to `CAUGHT`.

### Auth/tickets

- Signup validation, duplicate identity, verification delivery failure/recovery, action-code completion, resend limit.
- Login token verification, generic credential failure, frontend/backend unverified guards.
- OTP expiry, wrong attempts, five-attempt invalidation, password strength/history, one-time use.
- Ticket validation/reference uniqueness and independent submitter/admin email outcomes.

### PVE

- Legal/illegal transitions, stored-seed replay, minimum damage, HP/energy
  bounds, expected-turn rejection, win/loss/abandon, and one-time XP reward
  have focused automated evidence for commit under test `7991254`; the first
  draft evidence artifact is commit `d2cc497`, and the corrected grading/report
  evidence artifact is commit `5bc87d` with the split taxonomy and timeline.
- Catalog/decoder compatibility and responsive/accessibility cases support the
  core report scenarios rather than becoming separate headline use cases.

## Integration flows

Current focused:

1. Battle engine/catalog -> Firestore battle repository/transaction -> service/controller/route -> PVE HTTP.
2. Firestore `avatar_records` repository -> owner-only archive HTTP.
3. Real Archive/Battle pages, router, and shared components -> mocked `sproutApi`.

Supporting historical:

1. Signup -> mocked Firebase verification boundary -> `/api/auth/me` -> protected route.
2. Reset request -> fake email OTP -> verify -> Firebase password update/history.
3. Ticket submit -> persisted reference -> independent email outcomes.

Planned:

1. `POST /api/upload/plant` -> identification -> canonical processing/storage -> archive record.
2. Concurrent same-species uploads -> exactly one generation -> shared asset.
3. Real browser Archive -> PVE -> persisted progression.

## End-to-end scope for the final report

E2E is defined as a **complete round trip of user interaction**: from the user's
input through to the final output returned to the user. The four scenarios the
team identified on 2026-07-30:

| Scenario | Notes |
|---|---|
| Image upload | Requires the UC6 upload path to persist an archive entry |
| Sprite generation | Run against the mock pipeline layer, not a paid provider |
| Game loop, including leaderboard tracking | UC5 PVE plus progression persistence |
| Sign-up | UC1, with live email delivery still unproven |

Derive the scripts from the sequence diagrams. Automate with Playwright once the
code stack is complete; a non-technical person could verify these manually, but
an automated run is materially better evidence for the report.

## System cases from use cases

- **UC4 browser history:** Back/Forward preserves coherent archive/detail/battle
  navigation. Planned; JSDOM `beforeunload` is not real-browser proof.
- **UC4/UC5 full journey:** a verified user selects an owned archive record,
  completes/replays PVE, and observes persisted progression through the real
  browser/backend/Firestore stack. Planned.
- **UC1/UC2 live regression:** deployed Firebase sign-in, authorized domain,
  ID-token verification, and protected access. Planned.
- **UC3 live regression:** reset OTP arrives, password changes, old credentials
  fail, and new credentials work. Planned.
- **UC8 live regression:** ticket persists and controlled inboxes show
  submitter/admin outcomes. Planned.
- **UC6/UC4 progression:** upload completes identification, canonical
  processing/storage, and archive persistence without duplication. Planned.
- **Production Firestore:** owner isolation and durable progression under
  production rules/configuration. Planned.

## Test-case table format

Every report table row contains exactly: **test ID, use case, strategy, tool,
expected result, actual result, and evidence path**.

## Current focused evidence (2026-07-23)

- Commit under test: `7991254`; first draft evidence artifact: `d2cc497`;
  corrected grading/report evidence artifact: `5bc87d` (split taxonomy and
  timeline); Node.js `v22.23.1`.
- Server-authoritative eligibility: 1 Jest suite, 6/6.
- Battle catalog compatibility hardening: 1 supporting Jest suite, 12/12.
- Firestore battle repository + avatar HTTP API: 2 Jest suites, 96/96.
- PVE HTTP API: 1 Jest/Supertest suite, 18/18.
- BattlePage + real AppHeader navigation integration: 2 Vitest files, 28/28.
- PVE engine/property unit evidence: 2 Jest suites, 27/27.
- Demo archive Firestore/Supertest integration: 1 Jest suite, 22/22.
- ArchivePage: 1 Vitest file, 14/14.
- Non-overlapping total: 223 passing assertions across 11 focused files.

A prior combined focused emulator setup completed 113/114 before one
`beforeEach` exceeded the configured 15-second limit. The isolated PVE API
then passed 18/18 and all named focused sets above passed. This is not reported
as a behavior defect.

Broad auth/contact regression is supporting historical evidence and was
intentionally not rerun in this focused phase. Real browser Back/Forward, full
browser-to-backend Archive-to-PVE, live Firebase Auth/config, and production
Firestore are planned/not run.

## Timeline

The daily implementation and evidence schedule is in [[Timeline and Milestones]] and [[Checkoff 3 Readiness and Development Plan]]. Tests are written alongside each module, not postponed to 25 Jul.

**Ongoing execution (report answer to "how the rest of the tests should be implemented and executed"):** from 2026-07-25 the six focused command groups run automatically in GitHub Actions on every pull request to `main` (workflow `tests.yml`), so every future increment — UC6 upload/pipeline suites, broader auth/contact regression reruns, Playwright system cases — is added to the same pipeline as it lands. CI is regression evidence; the PM3 demo still shows the suites executing live.

## Related

[[Final Deliverables Plan]] · [[Test Matrix]] · [[Course Deliverables and Rubrics]] · [[Sequence Diagram Plan]] · [[Robustness and Fuzzing]]
