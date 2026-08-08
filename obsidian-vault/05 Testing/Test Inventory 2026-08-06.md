---
tags: [testing, inventory, final, evidence]
owner: Zhi Feng
measured: 2026-08-06
supersedes: "[[Test Inventory 2026-08-03]]"
status: current
---

> [!warning] SUPERSEDED by [[Test Inventory 2026-08-09]]
> Measured before PRs #25–#28. Every figure below is stale: the suite is now
> **1074 tests across 95 files**. Kept as the 6 Aug record, not as a source.

# Test Inventory — 2026-08-06

**The figures to quote in the final report.** Every earlier count in this vault
is stale; see [[#Superseded figures]] before reusing anything.

Measured by **running each suite and reading the runner's own total**, not by
counting `it(` declarations in the source. That distinction matters here:
parameterised cases expand at runtime, so a static grep of the server suite
returns 416 where the runner reports 565. A report quoting the grep would
understate the suite by a third and would not reconcile against a live demo.

## Totals

| Suite | Files | Tests | Tooling | Command |
|---|---:|---:|---|---|
| Server integration & API | 40 | **565** | Jest + Supertest, Firestore Emulator | `firebase emulators:exec --only firestore -- jest --runInBand` |
| Client components & routing | 26 | **265** | Vitest + React Testing Library | `npm test -w client` |
| Pipeline & fuzzing | 13 | **113** | Vitest | `npm run test:pipeline -w server` |
| End-to-end journeys | 5 | **11** | Playwright, Chromium + Firestore/Auth/Storage emulators | `npm run test:e2e` |
| **Total** | **84** | **954** | | |

All four suites green on commit `fb420d5`, 2026-08-06. Server suite runtime
107.8 s; E2E ~50 s including stack boot.

## What each tier actually proves

Worth stating in the report, because "949 tests" alone says nothing about
coverage of the *right* things.

- **Server integration (565).** Real Firestore semantics — transactions,
  concurrency, ownership checks, the authorisation matrix. Runs against the
  emulator rather than mocks, so a query that Firestore would reject fails here
  too.
- **Client (265).** Component contracts and routing: accessibility roles and
  names, disabled-state reasons, double-submit locking, route guards.
- **Pipeline & fuzzing (113).** The six pipeline stages plus the image ingest
  gate and its mutation fuzzer — 8 mutation strategies against a seed corpus of
  real plant photos, deterministic by injected seed. See [[Robustness and Fuzzing]].
- **E2E (11).** The only tier that starts at the user and ends at the user: a real
  browser drives the real React build, real Express, and a real Firestore
  emulator — and, since 6 Aug evening, the Auth and Storage emulators too, so
  real signup and the full scan→archive persist path are exercised. Nothing
  between the click and the database is substituted; the four paid providers
  are, via `USE_MOCK_APIS`, and that seam is disclosed. Coverage: UC1, UC4,
  UC5, UC6→UC4, UC8, plus the public-route posture. Mapping in
  `docs/TEST_TRACEABILITY.md`.

## Runs on every pull request

All four. E2E was initially gated to on-demand under the CI budget policy, then
un-gated on 6 Aug: that policy exists to stop *paid* runs, and this suite needs
no secret, makes no billable call, and finishes in under a minute. The genuinely
expensive job — `fuzz:live` — remains manual-only.

> **The "needs no secret" property is worth a sentence in the report.** A suite
> that depends on a secret cannot run on a fork, skips silently when the secret
> is absent, and reports green for having done nothing.

## Superseded figures

Do not reuse any of these:

| Figure | Where it came from | Status |
|---|---|---|
| 293 cases (217 server, 76 client) across 33 files | PM3 freeze, ~25 Jul | **Stale** |
| ~261 server + ~80 client across ~43 files | PR #7 branch estimate, 1 Aug | **Stale, and an estimate** |
| 522 tests across 52 files | [[Test Inventory 2026-08-03]] | **Stale** — predates PRs #15–#24 |

## Related

[[Testing Strategy]] · [[Robustness and Fuzzing]] · [[Cloud Native and Containerization]] · [[Test Inventory 2026-08-03]]
