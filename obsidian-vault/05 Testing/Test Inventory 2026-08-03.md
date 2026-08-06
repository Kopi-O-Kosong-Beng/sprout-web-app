---
tags: [testing, final, inventory, report]
source: fresh local run 2026-08-03 on features/zhifeng/scan-to-archive-persistence
updated: 2026-08-03
---

# Test Inventory - 2026-08-03 (fresh run)

Measured counts for the final report. [[Testing Strategy#Final-report documentation requirements (added 2026-07-30)]]
requires that no figure be quoted without a fresh run, and every earlier number in
this vault is stale.

**Superseded figures - do not reuse:** the 293-case figure (PM3 freeze) and the
"roughly 261 server + 80 client across ~43 files" estimate in
[[Zhi Feng Task List]] were both wrong at the time of writing and are further out
of date now.

## Totals

| Runner | Scope | Files | Tests |
|---|---|---|---|
| Jest | `server/tests/` (Firestore emulator) | 32 | **399** |
| Vitest | `client/src/` | 12 | **87** |
| Vitest | `server/pipeline/__tests__/` | 8 | **36** |
| | **Total** | **52** | **522** |

All green as of 2026-08-03. `npm run typecheck` clean in `server/`.

**Two runners, deliberately.** `server/tests/` is Jest; `server/pipeline/__tests__/`
and everything under `client/` is Vitest. Jest must be invoked as
`node node_modules/jest/bin/jest.js` from `server/` - a bare `jest` resolves to the
root-hoisted jest 30 and dies with `clearMocksOnScope is not a function`. This is
itself a documented engineering challenge, see [[Zhi Feng Task List]] section 4.

## Server - Jest, 399 across 32 files

Requires the Firestore Emulator (needs Java on PATH). Run with `--runInBand`;
parallel workers race because every suite's `beforeEach` calls `clearFirestore()`.

| Tests | File | Area |
|---:|---|---|
| 90 | `battle-repository.test.ts` | PVE persistence |
| 38 | `auth.test.ts` | UC1 auth |
| 26 | `battle-engine.test.ts` | PVE combat |
| 23 | `email.test.ts` | UC8 delivery |
| 22 | `avatar-demo.test.ts` | UC4 seeded demo set |
| 21 | `query.test.ts` | UC8 contact |
| 18 | `battle-api.test.ts` | PVE HTTP |
| 18 | `scan-persistence.test.ts` | **UC6 persistence (new)** |
| 16 | `admin-api.test.ts` | admin portal |
| 14 | `firestore-emulator-runner.test.ts` | test tooling |
| 12 | `battle-catalog.test.ts` | move resolution |
| 10 | `auth-user-repo-firestore.test.ts` | UC1 repository |
| 10 | `seed-admin-account.test.ts` | ops seeding |
| 9 | `avatar-upsert.test.ts` | **UC6 -> UC4 de-duplication (new)** |
| 9 | `sprite-storage.test.ts` | **UC6 canonical sprite (new)** |
| 8 | `app-config.test.ts` | route mounting / auth gates |
| 7 | `pipeline-complete-event.test.ts` | **UC6 wire contract (new)** |
| 6 | `avatar-api.test.ts` | UC4 archive HTTP |
| 6 | `battle-eligibility.test.ts` | PVE eligibility |
| 6 | `dex-repository.test.ts` | **first-discoverer (new)** |
| 6 | `species-stats.test.ts` | **deterministic stats (new)** |
| 5 | `check-storage.test.ts` | storage preflight |
| 4 | `avatar-discovery-api.test.ts` | **discoverer on detail (new)** |
| 4 | `ticket-repo-firestore.test.ts` | UC8 tickets |
| 3 | `firestore-only-runtime.test.ts` | datastore guard |
| 2 | `inspect-firestore.test.ts` | ops tooling |
| 1 | `background-dispatch.test.ts` | async dispatch |
| 1 | `clean-dist.test.ts` | build tooling |
| 1 | `firestore-emulator.test.ts` | emulator wiring |
| 1 | `pipeline-auth.test.ts` | **pipeline auth (new)** |
| 1 | `seed-firestore.test.ts` | seeding |
| 1 | `battle-engine.property.test.ts` | property-based (fast-check) |

`battle-engine.property.test.ts` counts as 1 case but runs many generated
inputs - worth stating explicitly in the report rather than letting it read as
a single assertion. Relevant to [[Robustness and Fuzzing]].

## Client - Vitest, 87 across 12 files

| Tests | File |
|---:|---|
| 25 | `pages/BattlePage.test.tsx` |
| 16 | `pages/ArchivePage.test.tsx` |
| 10 | `pages/LoginPage.test.tsx` |
| 7 | `pages/AdminPage.test.tsx` |
| 7 | `pages/VerifyEmailPage.test.tsx` |
| 4 | `common/ProtectedRoute.test.tsx` |
| 4 | `pages/ContactPage.test.tsx` |
| 4 | **`pages/ScanPage.test.tsx` (new)** |
| 3 | `common/AppHeader.admin-link.test.tsx` |
| 3 | `common/AppHeader.navigation-lock.test.tsx` |
| 3 | `pages/SignupPage.test.tsx` |
| 1 | `test/setup.test.ts` |

**Known flakiness, not a defect:** the full `vitest run` intermittently fails with
vitest worker start-up timeouts (usually surfacing in `ContactPage.test.tsx`) when
the machine is already loaded - e.g. straight after an emulator run. Every file
passes standalone and a clean re-run is 87/87. CI runs these in three separate
named groups rather than one process, so CI does not hit it.

## Server pipeline - Vitest, 36 across 8 files

| Tests | File |
|---:|---|
| 8 | `approve.test.ts` |
| 8 | `promptCraft.test.ts` |
| 5 | `finishSprite.test.ts` |
| 5 | `removeBg.test.ts` |
| 3 | `generateSprite.test.ts` |
| 3 | `programmaticEval.test.ts` |
| 2 | `assemblePlant.test.ts` |
| 2 | `identify.test.ts` |

## Mock layer disclosure

[[Testing Strategy]] requires the mock layer to be disclosed wherever mocked
results are reported. What is mocked, by suite:

- **Plant.id identification** - `identify.ts` returns a fixed `Polygala calcarea`
  result when `PLANT_API_KEY` is absent. No suite exercises that branch directly.
- **Gemini / sprite generation** - stubbed at the stage boundary in the pipeline
  Vitest suites; no suite spends generation credits.
- **Firebase Storage** - faked at the injected `SpriteStorageFile` boundary in
  `sprite-storage.test.ts`. No test touches a real bucket. Note the deployed
  Storage path has only ever had an Admin preflight (2026-07-21), so this is a
  **real coverage gap between the tests and production**.
- **Firebase Auth** - `getAuthAdmin` is jest-mocked, decoding a `verified:<uid>`
  token shape. Used by `avatar-api`, `avatar-discovery-api`, `admin-api`.
- **Firestore** - *not* mocked. The emulator is real, which is why those suites
  need Java and `--runInBand`.
- **SMTP / Resend** - `EMAIL_MODE=console` in `tests/setup-env.ts`.

## Commands

Server (from `server/`):

```
npm exec -- firebase emulators:exec --project sprout-test --only firestore "node node_modules/jest/bin/jest.js --runInBand"
```

Client (from `client/`): `npm exec -- vitest run`
Server pipeline (from `server/`): `npm exec -- vitest run`

To regenerate this inventory, add `--json --outputFile=<path>` to the Jest command
and `--reporter=json --outputFile=<path>` to the Vitest ones, then count
`assertionResults` per `testResults` entry.

## Related

[[Testing Strategy]] · [[Test Matrix]] · [[Robustness and Fuzzing]] · [[Zhi Feng Task List]]
