---
tags: [testing, inventory, final, evidence]
owner: Zhi Feng
measured: 2026-08-09
branch: main
supersedes: "[[Test Inventory 2026-08-06]]"
status: current
---

# Test Inventory — 2026-08-09

**The figures to quote in the final report.** Every earlier count in this vault
is stale — see [[#Superseded figures]] before reusing anything.

Measured by **running each suite on `main` and reading the runner's own total**,
not by counting `it(` declarations. That distinction is load-bearing:
parameterised cases expand at runtime, so a static grep of the server suite
returns roughly two thirds of the real figure. A report quoting the grep would
understate the suite and would not reconcile against a live demo.

## Totals

| Suite | Files | Tests | Tooling | Command |
|---|---:|---:|---|---|
| Server integration & API | 44 | **603** | Jest + Supertest, Firestore Emulator | `firebase emulators:exec --only firestore -- jest --runInBand` |
| Client components & routing | 28 | **309** | Vitest + React Testing Library | `npm test -w client` |
| Pipeline, ingest gate & fuzzing | 17 | **149** | Vitest | `npm run test:pipeline -w server` |
| End-to-end journeys | 6 | **13** | Playwright, Chromium + Firestore/Auth/Storage emulators | `npm run test:e2e` |
| **Total** | **95** | **1074** | | |

All four green on `main` at `a57d07a` (after PRs #25–#28), 2026-08-09.

## What changed since 2026-08-06

The suite grew by 120 tests in three days, and the growth is not evenly spread —
worth one sentence in the report, because it shows where the late effort went.

| Suite | 6 Aug | 9 Aug | What landed |
|---|---:|---:|---|
| Server | 565 | 603 | Emulator-presence guard, real-logout coverage, scan/sprite work |
| Client | 265 | 309 | `AuthContext.logout` unit suite, studio and scan changes |
| Pipeline | 113 | 149 | **Nat's fuzz expansion** — random baseline and text-validator suites, studio runner coverage |
| E2E | 11 | 13 | **Sign-out round trip** ([[#UC2 sign-out]] below) |

## What each tier proves

"1074 tests" alone says nothing about coverage of the *right* things.

- **Server integration (603).** Real Firestore semantics — transactions,
  concurrency, ownership, the authorisation matrix — against the emulator
  rather than mocks, so a query Firestore would reject fails here too.
- **Client (309).** Component contracts and routing: accessibility roles and
  names, disabled-state reasons, double-submit locking, route guards.
- **Pipeline & fuzzing (149).** The six stages, the image ingest gate, and the
  mutation fuzzer against that same gate. See [[Robustness and Fuzzing]] and
  `md/FUZZ_TESTING.md` (Nat).
- **E2E (13).** The only tier that starts at the user and ends at the user: a
  real browser drives the real React build, real Express, and the Firestore,
  Auth and Storage emulators. Nothing between the click and the database is
  substituted; the four paid providers are, via `USE_MOCK_APIS`, and that seam
  is disclosed. Covers UC1, UC2 sign-in **and sign-out**, UC4, UC5, UC6→UC4,
  UC8, plus the public-route posture. Mapping: `docs/TEST_TRACEABILITY.md`.

## UC2 sign-out — why a third tier was worth adding

Raised by a teammate: nothing exercised signing out. Three tiers now cover it,
and they are genuinely different questions rather than the same one repeated:

| Tier | File | Question answered |
|---|---|---|
| Client unit | `AuthContext.logout.test.tsx` | Does `logout()` do the right things when called? (Firebase mocked) |
| Integration | `server/tests/auth.test.ts` | Does `POST /api/auth/session/logout` write the audit? |
| **E2E** | `e2e/logout.spec.ts` | Is the button wired to it, does the redirect happen, is real browser storage actually emptied, does the route guard re-engage, does it survive a reload? |

**The E2E spec was mutation-verified.** Stubbing `endDevSession()` to leave the
session record in place kept the *header* assertion PASSING — React state had
still been cleared, so the UI flipped exactly as a working sign-out would —
while the storage and reload assertions both failed. A spec that only checked
the header would have been green against a sign-out that left the account
reachable on the next reload. That is the third recorded case in this project of
a green test that was not evidence, and the cheapest one to explain in the
report.

## Superseded figures

Do not reuse any of these:

| Figure | Source | Status |
|---|---|---|
| 293 cases (217 server, 76 client) / 33 files | PM3 freeze, ~25 Jul | **Stale** |
| ~261 server + ~80 client / ~43 files | PR #7 branch estimate, 1 Aug | **Stale, and an estimate** |
| 522 / 52 files | [[Test Inventory 2026-08-03]] | **Stale** |
| 954 / 84 files | [[Test Inventory 2026-08-06]] | **Stale** — predates PRs #25–#28 |

The report still carries the PM3 figure (293) in its Testing section. It must be
replaced with the table above.

## Related

[[Testing Strategy]] · [[Robustness and Fuzzing]] · [[Cloud Native and Containerization]] · [[Test Inventory 2026-08-06]]
