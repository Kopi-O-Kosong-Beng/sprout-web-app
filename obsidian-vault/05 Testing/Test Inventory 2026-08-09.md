---
tags: [testing, inventory, final, evidence]
owner: Zhi Feng
measured: 2026-08-11
commit: b184b62
supersedes: "[[Test Inventory 2026-08-06]]"
status: current
---

# Test Inventory — commit `b184b62`

**The figures to quote in the final report.** Every earlier count in this vault
is stale — see [[#Superseded figures]] before reusing anything.

Measured by checking out the commit, running `npm ci`, and running **each suite
to completion**, reading the runner's own total. Not by counting `it(`
declarations: parameterised cases expand at runtime, so a static grep of the
server suite returns roughly two thirds of the real figure.

**Counts are commit-specific.** Quoting a total without its SHA is how the
earlier error below happened.

## Totals — `b184b62` (tip of `main`, 19:15 on 9 Aug 2026)

| Suite | Files | Tests | Command |
|---|---:|---:|---|
| Server integration & API | 46 | **624** | `firebase emulators:exec --only firestore --project sprout-test "jest --runInBand"` |
| Client components & routing | 28 | **309** | `npm test -w client` |
| Pipeline, ingest gate & fuzzing | 18 | **155** | `npm run test:pipeline -w server` |
| End-to-end journeys | 6 | **13** | `npx playwright test` |
| **Total** | **98** | **1101** | |

## The same suites at neighbouring commits

Included because the report cites more than one SHA, and the numbers differ.

| Tier | `a57d07a` (03:26, 9 Aug) | `f308569` (13:01, 9 Aug) | `b184b62` (19:15, 9 Aug) |
|---|---|---|---|
| Server | 44 / 603 | 44 / 608 | **46 / 624** |
| Client | 28 / 309 | 28 / 309 | **28 / 309** |
| Pipeline | 17 / 149 | 18 / 155 | **18 / 155** |
| E2E | 5 / 11 | 5 / 11 | **6 / 13** |
| **Total** | **94 / 1072** | **95 / 1083** | **98 / 1101** |

`f308569` is **not** an ancestor of `a57d07a` and was never the tip of `main` —
it is a commit on `feat/migrate-plantemon-ui-and-dev-platform`, merged into main
at `b184b62` via PR #30. `a57d07a` was the tip only between 03:26 and 03:49.

> [!warning] Correction — a figure this vault published was wrong
> This note previously read **1074 across 95 files**, attributed to `a57d07a`.
> That run included `e2e/logout.spec.ts` as an **uncommitted working-tree file**
> — one extra file and two extra tests. `a57d07a` as committed is **94 / 1072**.
> The wrong figure had also reached `README.md`, `docs/TEST_TRACEABILITY.md` and
> `docs/DELL_METRICS.md`; all four are corrected as of 2026-08-11.
>
> The lesson is specific and worth keeping: **measure on a clean tree, or the
> number describes your laptop rather than the commit.** `git status --porcelain`
> before any count that will be published.

## What CI actually runs — not the full suite

`tests.yml` executes **named groups**, not whole suites:

| Job | What it runs | Coverage |
|---|---|---|
| Server focused suites | Groups 1, 2, 3, 4, 7 (+9, 10 vitest) | ~20 of 46 Jest files |
| Client focused suites | Groups 5, 6, 8 | **7 of 28** files |
| End-to-end journeys | `npm run test:e2e` | **all** 13 |

So "all suites green in CI" and "1101 tests passed" are **different claims**. The
totals above come from local full-suite runs; CI proves the focused evidence
groups plus the complete E2E tier. Say both, and say which is which.

Source: `git show b184b62:.github/workflows/tests.yml`

## What each tier proves

- **Server integration (624).** Real Firestore semantics — transactions,
  concurrency, ownership, the authorisation matrix — against the emulator
  rather than mocks, so a query Firestore would reject fails here too.
- **Client (309).** Component contracts and routing: accessibility roles and
  names, disabled-state reasons, double-submit locking, route guards.
- **Pipeline & fuzzing (155).** The six stages, the image ingest gate, and the
  mutation fuzzer against that same gate. See [[Robustness and Fuzzing]].
- **E2E (13).** The only tier that starts at the user and ends at the user: a
  real browser drives the real React build, real Express, and the Firestore,
  Auth and Storage emulators. Covers UC1, UC2 sign-in and sign-out, UC4, UC5,
  UC6→UC4, UC8, plus the public-route posture. Mapping in
  `docs/TEST_TRACEABILITY.md`.

## Known flake

`e2e/archive-to-battle.spec.ts:25` failed on **2 of 4** full local runs at both
`f308569` and `b184b62`, always the same way:

```
TimeoutError: page.goto: Timeout 20000ms exceeded
  navigating to "http://127.0.0.1:5173/archive"
```

It passed on retry both times, and CI has never hit it. The cause is the first
Vite dev-server compile of the `/archive` route on a cold start exceeding the
20 s navigation timeout — a harness flake, not a product defect. Worth stating
if the report claims the E2E tier is green: it is, on retry, roughly half the
time on a cold local machine.

## Superseded figures

Do not reuse any of these:

| Figure | Source | Status |
|---|---|---|
| 293 cases (217 server, 76 client) / 33 files | PM3 freeze, ~25 Jul | **Stale** |
| ~261 server + ~80 client / ~43 files | PR #7 branch estimate, 1 Aug | **Stale, an estimate** |
| 522 / 52 files | [[Test Inventory 2026-08-03]] | **Stale** |
| 954 / 84 files | [[Test Inventory 2026-08-06]] | **Stale** |
| 1074 / 95 files | This note, earlier revision | **Wrong** — measured on a dirty tree, see the correction above |
| 45 / 616 server | The draft report | **Matches no measured commit** — see [[Report Fact-Check 2026-08-11]] |

## Related

[[Report Fact-Check 2026-08-11]] · [[Testing Strategy]] · [[Robustness and Fuzzing]] · [[Cloud Native and Containerization]] · [[Test Inventory 2026-08-06]]
