---
tags: [testing, matrix, checkoff3]
source: Timeline.xlsx, approved design 2026-07-20
updated: 2026-07-23
---

# Checkoff 3 Test Matrix

> [!note] For the PM3 submission, use [[Checkoff 3 Test Plan and Test Cases]].
> That note carries the test plan, the integration-strategy justification, the timeline,
> and 56 written test cases. This matrix stays as the per-suite evidence index behind it.

This is the report-ready index for commit under test `7991254` under Node.js
`v22.23.1`. The first draft evidence artifact is commit `d2cc497`; the
corrected grading/report evidence artifact is commit `5bc87d`, which contains
the split test taxonomy and testing timeline.
`PLANNED / NOT RUN` means no passing evidence exists and must not be narrated
as complete.

## Core focused evidence

The six non-overlapping focused command groups total **223 passing assertions
across 11 focused files**. The table separates unit/property, backend
integration, and frontend integration evidence. Primary report rows should
select the core use-case scenarios. Decoder compatibility, retry/unmount
behavior, responsive containment, and accessibility hardening are supporting
cases within these totals.

| Test ID | Use case | Strategy | Tool | Expected result | Actual result | Evidence path |
|---|---|---|---|---|---|---|
| CORE-U01 | UC4/UC5: server-authoritative avatar eligibility | Decomposition bottom-up unit testing; black-box expiry boundaries plus white-box eligibility branches | Jest | Server time determines collected/temporary eligibility and rejects the exact expiry boundary | PASS: 1 suite, 6/6 | `server/tests/battle-eligibility.test.ts` |
| CORE-I01 | UC4/UC5: owner archive and Firestore battle persistence | Call-graph bottom-up; black-box ownership/boundary plus white-box concurrency/replay | Jest, Supertest, Firestore Emulator | Owner-only bounded archive reads and exactly-once battle transition/reward persistence | PASS: 2 suites, 96/96 | `server/tests/battle-repository.test.ts`; `server/tests/avatar-api.test.ts` |
| CORE-I02 | UC5: PVE HTTP API | Call-graph bottom-up from engine/catalog through Firestore repository/transaction, service/controller/route, then HTTP | Jest, Supertest, Firestore Emulator | Verified start/read/action/abandon/completion requests return controlled public state without duplicate progression | PASS: 1 suite, 18/18 | `server/tests/battle-api.test.ts` |
| CORE-F01 | UC5: Battle page and real shared-header navigation | Top-down caller-side component integration with real page/router/components and mocked `sproutApi` | Vitest, RTL, MemoryRouter | PVE states render correctly and navigation locks only during pending non-idempotent start/replay | PASS: 2 files, 28/28 | `client/src/pages/BattlePage.test.tsx`; `client/src/components/common/AppHeader.navigation-lock.test.tsx` |
| CORE-U02 | UC5: battle engine and generated-state properties | Decomposition bottom-up unit/property testing; white-box branch, path, invariant, and generated-state cases | Jest, fast-check | Legal transitions preserve HP, energy, legal-move, terminal-state, immutability, and deterministic-replay invariants | PASS: 2 suites, 27/27 | `server/tests/battle-engine.test.ts`; `server/tests/battle-engine.property.test.ts` |
| CORE-I03 | UC4: owner-scoped demo archive enable/disable | Call-graph bottom-up repository/HTTP integration; black-box auth/outcome plus white-box collision, retry, and race paths | Jest, Supertest, Firestore Emulator | Demo mutation is exact, owner-scoped, idempotent, race-safe, and preserves collected records | PASS: 1 suite, 22/22 | `server/tests/avatar-demo.test.ts` |
| CORE-F02 | UC4: Archive page | Top-down caller-side component integration with real page/router/components and mocked `sproutApi`; black-box DOM/state cases | Vitest, RTL, MemoryRouter | Loading, empty, pagination, demo mutation, retry, unmount, fallback, and Archive-to-Battle handoff states match the UI contract | PASS: 1 file, 14/14 | `client/src/pages/ArchivePage.test.tsx` |

## Current supporting hardening

This current row is included in the 223-test total but is not a separate
headline use-case claim.

| Test ID | Use case | Strategy | Tool | Expected result | Actual result | Evidence path |
|---|---|---|---|---|---|---|
| SUP-U01 | UC5 support: versioned battle catalog compatibility | Decomposition bottom-up unit testing; white-box compatibility and rejection branches | Jest | Stored `thornback-v1` data remains compatible while incomplete, forged, or unsupported sets are rejected | PASS: 1 suite, 12/12 | `server/tests/battle-catalog.test.ts` |

## Focused run qualification

| Test ID | Use case | Strategy | Tool | Expected result | Actual result | Evidence path |
|---|---|---|---|---|---|---|
| QUAL-I01 | UC4/UC5: prior combined focused emulator setup | Combined focused backend integration setup | Jest, Supertest, Firestore Emulator | All combined setup and cases complete within the configured timeout | 113/114 completed; one `beforeEach` exceeded 15 seconds. This is not a demonstrated behavior defect. Isolated PVE HTTP passed 18/18 and every named focused set above passed. | `server/tests/battle-api.test.ts`; `server/package.json` |

## Supporting historical regression

This section preserves earlier UC1-UC3/UC8 evidence without counting it toward
the current 223. It was intentionally not rerun in the focused UC4/UC5 phase,
so there is no current broad regression claim.

| Test ID | Use case | Strategy | Tool | Expected result | Actual result | Evidence path |
|---|---|---|---|---|---|---|
| AUTH-U01 | UC1: signup boundaries and resend controls | Black-box equivalence/boundary plus white-box branch | Jest | Valid/invalid profile inputs and resend quotas follow the auth contract | SUPPORTING HISTORICAL PASS at `a28e6e2`; not rerun in this focused phase | `docs/checkoff3/auth-email-verification-evidence.md`; `server/tests/auth.test.ts` |
| AUTH-I01 | UC1/UC2: action code, profile refresh, protected access | Selected caller-side auth-to-Firebase verification edge plus component state | Jest, Supertest, Vitest, Firebase fake | Automated boundaries accept verified users and reject invalid/unverified users | SUPPORTING HISTORICAL PASS at `a28e6e2`; live Firebase action/authorized-domain flow not run | `docs/checkoff3/auth-email-verification-evidence.md` |
| AUTH-U04 | UC3: OTP expiry, attempts, consume, and history | Boundary, branch, concurrency, and replay | Jest | Reset remains generic, bounded, one-time, and history-aware | SUPPORTING HISTORICAL PASS at `a28e6e2`; not rerun in this focused phase | `docs/checkoff3/auth-email-verification-evidence.md`; `server/tests/auth.test.ts` |
| TKT-I01 | UC8: persisted ticket and independent notifications | Call-graph bottom-up with selected outcome combinations | Jest, Supertest | Persistence is independent of submitter/admin notification outcomes | SUPPORTING HISTORICAL PASS at `a28e6e2`; live delivery not run | `docs/checkoff3/auth-email-verification-evidence.md`; `server/tests/query.test.ts` |
| FE-U01 | UC1/UC2/UC8: frontend auth and honest Contact Us states | Top-down component state integration | Vitest, RTL | Verification, protection, login, and ticket copy match public behavior | SUPPORTING HISTORICAL PASS at `a28e6e2`; not rerun in this focused phase | `docs/checkoff3/auth-email-verification-evidence.md` |

## Planned progression and system evidence

UC6 upload/pipeline work stays planned. Passing `avatar_records` archive tests
do not imply that upload, plant identification, AI generation, canonical asset
processing, or the upload-to-archive pipeline exists.

| Test ID | Use case | Strategy | Tool | Expected result | Actual result | Evidence path |
|---|---|---|---|---|---|---|
| IMG-U01 | UC6: upload format, magic bytes, empty/exact-limit/over-limit cases | Black-box equivalence and boundary unit tests | Jest | Invalid input is rejected and supported boundary inputs follow the upload contract | PLANNED / NOT RUN | [[UC6 Upload Plant Picture]] |
| IMG-U02 | UC6: confidence threshold | Black-box boundary values | Jest | Below/at/above-threshold identification results map predictably | PLANNED / NOT RUN | [[UC6 Upload Plant Picture]] |
| IMG-U03 | UC6: 56x56 palette/alpha/determinism | White-box invariant/property tests | Jest, fast-check | Output is deterministic, palette-closed, alpha-preserving, and 56x56 | PLANNED / NOT RUN | [[GenAI Sprite Pipeline]] |
| IMG-U04 | UC6: recipe cache/lock/retry | White-box branch, concurrency, and replay | Jest | One generation wins and retries reuse the canonical result | PLANNED / NOT RUN | [[GenAI Sprite Pipeline]] |
| IMG-I01 | UC6/UC4: upload to archive | Call-graph bottom-up backend integration | Jest, Supertest | Upload reaches identification/processing/storage and creates one archive record | PLANNED / NOT RUN | [[UC6 Upload Plant Picture]]; [[UC4 Browse Avatar Archival]] |
| FE-U02 | UC6/UC4: upload UI to archive provenance | Top-down caller-side component integration | Vitest, RTL, MemoryRouter | Progress/error/success/provenance states match the eventual upload contract | PLANNED / NOT RUN; the frontend test framework exists, but this UC6 flow does not | [[UC6 Upload Plant Picture]] |
| SYS-A01 | UC4: browser Back/Forward | Use-case-derived black-box browser system test | Playwright | Real browser history preserves coherent archive/detail/battle navigation | PLANNED / NOT RUN; JSDOM `beforeunload` is not real-browser proof | `docs/checkoff3/archive-pve-verification-evidence.md` |
| SYS-P01 | UC4/UC5: full Archive-to-PVE browser-to-backend flow | Use-case-derived black-box system test | Playwright | A verified user completes the real HTTP/Firestore journey and observes persisted progression | PLANNED / NOT RUN | [[UC4 Browse Avatar Archival]]; [[UC5 PVE Battle]] |
| SYS-F01 | UC1/UC2: live Firebase Auth/config | Use-case-derived live system test | Playwright plus controlled Firebase account | Deployed sign-in, token verification, authorized domain, and protected access work | PLANNED / NOT RUN; Firebase verification is mocked at the Admin boundary in automated tests | `docs/checkoff3/auth-email-verification-evidence.md` |
| SYS-D01 | UC4/UC5: production Firestore | Use-case-derived live datastore system test | Playwright/manual cloud inspection | Production rules/config preserve owner isolation and durable progression | PLANNED / NOT RUN; current integration uses the Firestore Emulator | `docs/checkoff3/archive-pve-verification-evidence.md` |
| SYS-E02 | UC1-UC3/UC8: deployed email regression journey | Use-case-derived live system test | Playwright/manual inbox | Controlled inboxes prove verification, reset, and ticket notification behavior | PLANNED / NOT RUN | `docs/checkoff3/auth-email-verification-evidence.md` |
| SEC-A01 | All: deployed secret/rules audit | Audit and misuse cases | Secret scan/checklist | No secret is exposed and production rules/config fail closed | PARTIAL historical Admin bucket preflight; final deployment audit PLANNED / NOT RUN | [[Firebase Storage Activation]] |

## Evidence naming

Use the test ID in each report caption, screenshot, command extract, or video
timestamp. Link current focused evidence to commit under test `7991254`, first
draft evidence artifact commit `d2cc497`, corrected grading/report evidence
artifact commit `5bc87d` (the split-taxonomy and timeline version), and
`sprout-app/docs/checkoff3/archive-pve-verification-evidence.md`.

## Full-suite gate

The current evidence is a focused gate, not a full-suite gate. Broad
auth/contact regression remains historical supporting evidence and was not
rerun. A broader regression, live providers, real browser checks, and
production Firestore remain separate planned gates before freeze.

## Related

[[Testing Strategy]] · [[Checkoff 3 Readiness and Development Plan]] · [[Timeline and Milestones]]
