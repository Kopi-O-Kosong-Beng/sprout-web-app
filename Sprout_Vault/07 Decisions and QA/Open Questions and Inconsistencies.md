---
tags: [decision, tracking, checkoff3, final]
updated: 2026-08-06
---

# Open Questions and Inconsistencies

## Final phase (opened 2026-07-30 to 2026-08-01)

| Item | State |
|---|---|
| **Email domain** | **Resolved: do not buy one.** Justin, 30 Jul. The 30 Jul meeting notes recommend purchasing a domain for OTP/notification email; the team overrode that the same day and keeps to the local machine. Consequence: live email delivery stays unproven and the demo uses a magic-link or local fallback. Say so plainly in the report |
| **Repository architecture** | **Meeting note is wrong about reality.** The notes record a decision to keep *separate* client and server repositories for API-key isolation. The actual repository `Kopi-O-Kosong-Beng/sprout-web-app` is a single monorepo with `client/` and `server/` workspaces, deployed to Vercel and Render. Do not describe separate repositories in the report; isolation comes from the workspace split plus host-level environment variables |
| **PR reviewer and merger** | **Resolved: Zhi Feng.** The 30 Jul notes say nat sim is the primary reviewer/merger. The Telegram from the same day names @zhifeeeng as final reviewer, and on 1 Aug Nat asked Zhi Feng to review and merge PR #7 before handing off. Zhi Feng also owns the Vercel/Render configuration |
| ~~PR #7 unmerged~~ | **Resolved 2026-08-01 15:14 GMT** (`a38e27b`). The GenAI pipeline, dev/admin platform, and six client pages are on `main`; Vercel and Render reconfigured by Zhi Feng |
| ~~**UC6 does not persist**~~ | **Resolved on `features/zhifeng/scan-to-archive-persistence`** (PR not yet open - reference the branch, not a merge commit). `POST /api/pipeline/run-stream` now writes a persistent `avatar_records` entry via `avatarRepository.upsertFromScan` before the run completes, and a first-discoverer `dex` entry alongside it. **Correction to this row's earlier wording:** the route was never actually unguarded - `pipeline.routes.ts` has called `router.use(authMiddleware)` since the platform migration (`627c6b0`, 30 Jul); the "no auth guard" claim here and in [[Final Deliverables Plan]] was wrong when written. The UC6 -> UC4 provenance chain is closed; see [[UC6 Upload Plant Picture]]. Battle stats (hp/attack/defense/speed) are derived deterministically from the species key by a pure hash, not taken from the pipeline's own `maxHealth: 100` and `Math.random()` speed - same species, same numbers, every machine, every run |
| ~~**`ADMIN_EMAIL` vs `ADMIN_EMAILS`**~~ | **Resolved by 2026-08-06:** `render.yaml` on `main` declares `ADMIN_EMAILS` (plural, advisory badge) and `SUPER_ADMIN_EMAILS` (the operator gate) with real values, and documents the split. The singular `ADMIN_EMAIL` key remains only as a legacy row |
| **Docker "report-only" decision reversed** | **2026-08-06.** The 4 Aug decision (no Dockerfile, all container content PROPOSED) was made when the Dell ask was a summary report. Kenny Lu's email now requires the final product **deployed and containerized**, submission = Dockerfile + image on 11 Aug. Owner Zhi Feng. `docs/dell-docker-report.md` (still untracked) must have its SHIPPED/PROPOSED labels reworked once the artifacts exist. See [[Dell Book Prize Competition]] |
| **Showcase time moved** | The 30 Jul plan said 11 Aug 11:30 and "20 min presentation"; Justin's 4-6 Aug messages fix it at **12:30pm, TT6 (1.416)**, ~17 min talk + 3-min demo + 10 min Q&A, prof-confirmed. The rubric text's "15 minutes" is superseded by Justin's confirmed outline |
| **UC4 A3 "Battle with this avatar"** | Agreed 2026-08-01 as a new alternative path. Needs the use case description, UC4/UC5 sequence diagrams, and the requirement-change table updated - Andrina, Omar, Li Xiang. See [[UC4 Browse Avatar Archival]] |
| ~~**Playwright not installed**~~ | **Resolved 2026-08-06 (PR #24).** 6 end-to-end specs across 2 files, driving a real Chromium against the real React build, real Express and the Firestore emulator — nothing between the click and the database is substituted. The four paid providers are, via `USE_MOCK_APIS`; that seam is disclosed rather than left to be found. Runs on **every pull request**, because it needs no secret and finishes in under a minute. Two earlier drafts of the archive-to-battle spec passed while proving nothing (one asserted "page not empty", the next matched the header nav link instead of the archive's own shortcut) — both are recorded in the spec comments as worked examples of a green test that was not evidence |
| ~~**Test-count figures are stale**~~ | **Resolved 2026-08-06 — see [[Test Inventory 2026-08-06]].** Measured by running each suite: **949 tests across 81 files** (565 server Jest, 265 client Vitest, 113 pipeline Vitest, 6 Playwright E2E). Measured from the runners, not from counting `it(` declarations — parameterised cases expand at runtime, so a static grep returns 416 for the server suite where the runner reports 565. Every earlier figure in this vault (293 / ~261+80 / 522) is superseded and must not be quoted |

## Resolved for Checkoff 3

| Issue | Resolution |
|---|---|
| UC numbering differs | Use formal UC1-UC8 numbering in [[Use Case Model]] |
| UC6 only extends PVE | UC6 is now an independent base use case; UC5 selects an existing collection entry |
| Unique sprite per scan vs one per species | Versioned canonical sprite per stable species ID |
| Web-only temporary avatar | Persistent `VISITED` collection entry; mobile may promote to `CAUGHT` |
| FLUX vs Gemini | Configured Gemini image adapter is the Checkoff 3 target |
| No design lock | remove.bg then 56x56 FLORENTINE24 `florentine24-v1` quantization |
| Sprite storage | Firebase Storage objects are the target; paths/metadata belong in Firestore. Admin bucket preflight passed, but the application adapter, client rules, and deployed integration remain not run. |
| Auth stack fork | Firebase Auth/ID tokens are authoritative; Express verifies tokens; no custom login JWT |
| Signup verification API | Sprout `/verify-email` applies Firebase action code; `/api/auth/me` synchronizes; backend resend endpoint generates a fresh link |
| UC3 unknown email response | Always generic 200 for reset request to prevent enumeration |
| Contact form fields | Implemented `name`, `email`, `category`, `message` set is canonical |
| Query email behavior | Persist first; independently attempt submitter and admin notifications; record outcomes |
| PVE opponent/reward | Fixed versioned NPC, seeded RNG; win +20 XP, loss +5, abandon +0; one-time reward |
| Integration strategy | Primary call-graph bottom-up backend integration plus top-down caller-side React integration; selected mocked boundary/outcome cases only, with no systematic call-graph pairwise coverage claim |
| Diagram style for PM3 | Domain/analysis-level set delivered 2026-07-24 (`Latest Diagrams 27_Jully`): UC1–UC8 sequence diagrams + class diagram with one shared vocabulary; replaces the implementation-labeled diagram plan and the 2026-07-20 Router/Adapter drafts. Verified against `C3T2_UseCaseDescription_1D.docx` and machine-rendered 2026-07-25 — see [[Sequence Diagram Plan]] |

## Current implementation gaps, not design questions

- ~~Remote `main` remains console-mode at `8e1077d`~~ **Superseded 2026-07-26:** `main` is deployed at `d03319a` with the Resend HTTPS transport (Render's free tier blocks outbound SMTP on port 587). Real-inbox proof still requires a verified sending domain, so live delivery remains unproven.
- Signup recovery, in-app action-code handling, strict UID-keyed resend limits, and account/IP isolation are implemented through `a28e6e2`; live Firebase/Gmail evidence remains pending.
- Frontend/backend protected routes reject unverified and no-email tokens on `a28e6e2`.
- Reset anti-enumeration, controlled background delivery, attempt limiting, atomic consume, stale isolation, concurrency, password history, and test runtime are implemented on `a28e6e2`; live SMTP and graceful dispatcher drain remain pending.
- Ticket persist-first boundaries, independent outcomes, and controlled failure codes have historical pre-cutover evidence at `a28e6e2`. The current runtime is Firestore-only; that historical ticket regression was not rerun in the focused UC4/UC5 phase, and deployed Gmail delivery remains unverified.
- Firebase Storage is activated and the live Node 22 Admin write/read/delete preflight passed for `sprout-dev-66f08.firebasestorage.app` on 2026-07-21 — **still the only live evidence.** `server/services/sprite-storage.ts`, canonical asset persistence, background removal, quantizer, and archive upsert are now implemented on `features/zhifeng/scan-to-archive-persistence` and covered by the automated suite, but the deployed Render/Firebase integration itself has not been exercised. `FIREBASE_STORAGE_BUCKET` must be present in the Render environment or the sprite write throws; no one has confirmed the deployed value.
- Web PVE engine/catalog, Firestore session/reward transactions, routes, and Battle page are implemented with focused automated evidence at commit under test `7991254`; the first draft artifact is `d2cc497`, and the corrected grading/report artifact is `5bc87d` with the split taxonomy and timeline. The real browser-to-backend Archive-to-PVE journey remains planned/not run.
- Vitest/jsdom/React Testing Library ArchivePage, BattlePage, and real AppHeader navigation integration passed for commit under test `7991254`; the first draft artifact is `d2cc497`, and the corrected grading/report artifact is `5bc87d` with the split taxonomy and timeline. UC6 upload/pipeline component tests and real-browser Back/Forward proof remain planned; JSDOM `beforeunload` is not browser proof.
- ~~**UC1 diagram/description mismatch**~~ **Resolved 2026-07-25:** the diagram's `3a`–`3d` branches match the implemented signup (which validates display name, email, and password policy separately), so [[UC1 Signup]] was updated to match the diagram rather than the reverse. Recorded as row R2 in [[Checkoff 3 Requirement Changes]].
- ~~**UC8 field-set conflict**~~ **Resolved 2026-07-25:** the Contact Us form now implements the documented `name`, `email`, `organisation` (optional), `subject`, `category` (inquiry type), `message` set. The interim reduced set was a drift from the requirement, not a decision. Row R3.
- ~~**UC4 detail fields**~~ **Resolved 2026-07-25:** habitat and conservation status now appear in the archive detail panel and in the demo species data, per UC4 step 3.
- ~~The PM3 **use case diagram** must be re-exported~~ **Resolved 2026-07-25:** drawn and rendered to `_attachments/pm3-diagrams/use-case-diagram.png` with UC1–UC8, the three primary actors, the requirement-doc secondary actors, and UC6 as a base use case that also `«extend»`s UC5. Source: `Raw dump/check_off 3/Latest Diagrams 27_Jully/UseCaseDiagram.mmd`.
- ~~UC8 field-name gap for the report~~ **Closed 2026-07-26:** no gap remains. The form implements `name`, `email`, `organisation` (optional), `subject`, inquiry type, and `message`, matching the description and diagram. Recorded as R3 in [[Checkoff 3 Requirement Changes]].
- Live provider checks are blocked by missing `PLANTID_API_KEY`, `GEMINI_API_KEY`, `REMOVE_BG_API_KEY`, and Gmail SMTP credentials; mock/fixture passes must not be reported as live-provider evidence.
- ~~Firebase Storage Admin bucket preflight passed. The application adapter,
  client rules, and deployed integration remain not run~~ **Superseded 2026-08-02:**
  the application adapter is implemented (see the bullet above); the deployed
  Render/Firebase integration is still the only thing not proven. Follow
  [[Firebase Storage Activation]] before treating a live scan as verified.
- **`/run-stage2c` always persists `speciesFamily: null`.** Its synthetic
  identification object carries no taxonomy. That route is only used by
  `PipelineStudio.tsx` (the internal dev studio), not by the user-facing
  `ScanPage`, so it was deliberately left unfixed on
  `features/zhifeng/scan-to-archive-persistence`. A null family makes
  `resolveBattleMoves` fall through to the generic fallback moveset.
- **Archive de-duplication is not transactional and only inspects the caller's
  most recent 1000 records.** Two genuinely concurrent scans of the same
  species could both create a record, and a user with more than 1000 distinct
  species would get a duplicate rather than an error. Both accepted
  deliberately, consistent with the filter-then-work-in-memory decision
  already recorded for `listByUser` — see [[UC6 Upload Plant Picture]].
- **`tests/app-config.test.ts` runs in no CI group.** The assertions that the
  pipeline route rejects anonymous callers exist but are not enforced by CI.
  Pre-existing gap, flagged here, not fixed by
  `features/zhifeng/scan-to-archive-persistence`.

## Team confirmations still needed before final release

These do not block the Checkoff 3 design because a fallback/default is already defined.

| Question | Checkoff 3 default | Why confirm later |
|---|---|---|
| Firebase Storage application cutover | Adapter is implemented and is the scan path on `features/zhifeng/scan-to-archive-persistence`; confirm `FIREBASE_STORAGE_BUCKET` is set in Render before relying on it | Only an Admin bucket preflight (2026-07-21) has ever run against the live bucket; the deployed sprite write is unproven |
| Exact Gemini image model/token | Environment-configured adapter and deterministic fake | Provider availability/cost may change |
| FLORENTINE24 license/attribution | Use for course prototype and record source; verify before commercial release | Product/IP hygiene |
| PM3 live checkoff date | Plan from video deadline 26 Jul | Rehearsal and remaining-fix window |
| Public leaderboard formula | Deferred | Raw XP is farmable without season/difficulty/daily limits |
| Mobile proof of real-world capture | Treat `CAUGHT` as a trust signal | Camera-to-screen loophole is not fully solvable |

## Contradictory local plan

The untracked repository file `GOOGLE_SMTP_VERIFICATION_PLAN.md` says UC8 should be database-only. The team's newer outstanding list and [[UC8 Submit Query Ticket]] require a Sprout-admin email. Do not execute that database-only instruction without an explicit team requirement change.

## Related

[[Final Deliverables Plan]] · [[Checkoff 3 Readiness and Development Plan]] · [[Feature Priorities]] · [[Use Case Model]] · [[Testing Strategy]]
