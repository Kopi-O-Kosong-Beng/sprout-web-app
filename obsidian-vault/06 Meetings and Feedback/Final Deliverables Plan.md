---
tags: [meeting, planning, final, checkoff3]
date: 2026-07-30
updated: 2026-08-06
source: Gemini meeting notes 2026-07-30 11:55 GMT+8, team Telegram 30 Jul - 6 Aug 2026, prof consult 6 Aug 2026, repository inspection 2026-08-01, branch inspection 2026-08-02
owner: Zhi Feng
status: active
---

# Final Deliverables Plan (post-Checkoff 3)

This note is the coordination hub for the **final** submission. It supersedes
[[Checkoff 3 Readiness and Development Plan]] as the active plan; that note stays
as the PM3 record.

Two sources feed this plan and they do not always agree. Where they conflict,
the **later Telegram decision wins** and the conflict is recorded in
[[#Conflicts between the meeting notes and the team decisions]].

## Fixed dates (updated 6 Aug from Justin's Telegram)

| Item | Date | Detail |
|---|---|---|
| Team internal freeze | 7 Aug 2026 | Justin's target so Andrina is not writing over the NDP long weekend |
| Dell interest email | 10 Aug (Mon) | Justin emails Kenny Lu + Prof Dileepa — see [[Dell Book Prize Competition]] |
| **Final showcase** | **11 Aug 2026, 12:30pm, TT6 (1.416)** | In front of the class, no external audience. ~17 min talk + 3-min demo (only tested parts) + 10 min Q&A (mostly on Test). Dell Dockerfile + image shared here. *The earlier 11:30 time is superseded* |
| Dell shortlist | 13 Aug (Wed) | Top 3 by 1D final grade |
| Dell final pitch | 14 Aug (Fri) 2-4pm | Dell office, shortlisted teams only |
| **Peer evaluation** | **15 Aug 2359** | Mandatory — no peer eval ⇒ individual report scores 0 |
| **Final submission** | **16 Aug 2359 (Week 13 Sun)** | Final report, individual reports, presentation slides, 7-min pitch video (incl. 3-min demo), code |

## Final submission package

| Artifact | Weight | Owner | Notes |
|---|---:|---|---|
| Group report | 16% incl. bonus | Andrina (compiler) | Six sections; testing content ported from PM3 |
| Presentation slides - project journey | part of 5% | Justin | Problem, solution, journey, challenges |
| Presentation slides - demo | part of 5% | Justin | Demo runs **at the end** of the presentation |
| Recorded video | - | Nat (backup demo recording) | Narration materially improves evaluation |
| Individual report + peer review | 5% each member | every member | No peer review submitted -> individual report scores 0 |

### Presentation outline — CONFIRMED with prof, 6 Aug (no more changes)

Justin's breakdown, may be structured feature-by-feature (use case, class,
sequence, demo, test) instead of topic-by-topic:

| Slot | Time | Owner |
|---|---|---|
| Intro: problem statement, business value / impact | 1 min | Andrina |
| Use case: feature summary, text summary of requirements | 2 min | Justin |
| Class & sequence: detailed class + **one** most-complicated sequence diagram (showing composition, lifelines, activation bars); abstract the rest | 4 min | Omar, Li Xiang |
| **Cloud Native Design and Architecture Rationale and Resiliency** | 1 min | **Zhi Feng**, Justin |
| Test suite: methodology & strategy; unit / integration / E2E (manual + auto) / fuzzing | 7 min | Nat, **Zhi Feng**, Justin, Omar |
| Implementation challenges + production merging; PM-feedback handling (Justin) | 1 min | **Zhi Feng**, Nat |
| SDI & UN SDG | 0.5 min | Andrina |
| Conclusion: beyond-the-classroom / out-of-box thinking | 0.5 min | Justin |
| **Demo — only parts that are tested** | 3 min | — |
| Q&A — mostly on Test | 10 min | all |

The Dell competition judges the class-side round on this presentation — it
must mention Cloud Native + the test suite ([[Dell Book Prize Competition]]).

Only demo features that are actually tested. A failed demo invites closer
scrutiny of the testing documentation.

### 6 Aug consult — report structure requirements

- Report as **technically detailed as possible**.
- Use case diagram and class diagram go in the **main report content**.
- Use case descriptions and sequence diagrams go in the **appendix,
  hyperlinked** from the main content.
- **Cross-reference which test suite covers which sequence diagram,
  hyperlinked** — new requirement on the testing sections (Zhi Feng, Nat).
- E2E is defined as "starting from user and ending with user".

### Constraint to highlight in the report (Justin, 4 Aug)

Without a purchased/verified domain and MX configuration, the email server
delivers to **one specific email only** (it routes MX to itself). Signup
email-verification and Reset-password OTP therefore work fully, but for that
single address. Justin's call: the constrained feature is acceptable **as long
as the report highlights it explicitly**. This lands in Zhi Feng's
backend-email sections.

### Emphasis notes for report + slides (Justin, 3 Aug)

- Project cares about **UX, not UI** (UI itself has no weightage).
- Interactivity — beautifying/animating the shell — earns creativity bonus (10%).
- Security protocol and deployability are worth calling out.
- **Robustness testing matters more than the code**; the fuzzer implementation
  is worth featuring (now real: PR #22's ingest gate + mutation fuzzer).

### Individual report sections (each member writes their own)

1. Contribution to requirement formulation and refinement
2. Contribution to the design
3. Contribution to the implementation - **name the subsystems you implemented**
4. Contribution to testing - **name the test types you designed and developed**
5. AI hallucination diary
6. Reflection: if the project was not successful in your opinion, what is the main reason

Justin's agreed baseline for "who did what" is in [[Team and Roles#Final phase ownership]].

## Timeline

| Due | Item | Owner |
|---|---|---|
| 2 Aug | Report: requirements / updated use case descriptions | Andrina |
| 2 Aug | Report: feature progress | Andrina |
| 2 Aug | Report: sustainability, diversity and inclusion | Andrina |
| 2 Aug | Share the planned UI changes so Andrina can update use case descriptions concurrently | Omar, Justin |
| 2 Aug | **Integrate the GenAI pipeline into the main code stack** | Nat, Zhi Feng |
| 5 Aug | Merge all UI improvements | Omar, Justin |
| 5 Aug | Finalise report docs for unit / integration / E2E / robustness | Nat, Zhi Feng |
| 6-7 Aug | Finalise class and sequence diagram changes | Li Xiang (with Omar) |
| 6-7 Aug | Record backup demo video | Nat |
| 7 Aug | Finished report | Andrina + all |
| 7 Aug | Draft the 5-minute slides to record | Justin |
| 7-10 Aug | Dockerfile + image + compose for the Dell submission | Zhi Feng |
| 10 Aug | Dell interest email | Justin |
| 11 Aug 12:30pm | Final showcase (TT6, 1.416) + Dell submission shared | all |
| 15 Aug 2359 | Peer evaluation | every member |
| 16 Aug 2359 | Final report, individual reports, slides, 7-min pitch video, code | all |

## Page and feature ownership

Every change goes through a feature branch and a pull request. **Zhi Feng is the
final reviewer and merger.**

| Surface | Owner |
|---|---|
| Signup, Login, Reset, Contact Us | Justin |
| Landing page | Nat |
| View Sprite, Upload Picture | Li Xiang, Omar |
| PVE battle | Zhi Feng |
| Upload and Generate frontend wired to the GenAI pipeline | Nat, Zhi Feng |
| Front-facing error toast | Nat |
| End-to-end tests (Playwright) | Nat |
| Sequence diagram revision | Omar, Li Xiang |
| Report compilation | Andrina |
| Implementation-challenges write-up (rubric-driven) | Zhi Feng, Nat |

## Engineering decisions taken on 30 Jul

1. **Mock the AI pipeline for UI/UX testing.** A mock layer or HTTP responder
   avoids paying for generation calls during frontend development and lets
   features be tested in isolation.
2. **Keep the AI pipeline modular.** Small distinct stages instead of one opaque
   sequence, so a failure can be isolated to a segment. Already true in code:
   `identify -> promptCraft -> generate -> removeBg -> finish -> assemble`.
3. **Admin and developer pages sit behind a fixed credential.** No user
   management system for the showcase.
4. **The landing page routes on authentication**, sending a user to either the
   standard interface or the admin dashboard based on the account email.
5. **Deploy the backend to a cloud host (Render).** Do not host the demo from a
   laptop; that means exposing ports and disabling a firewall.
6. **Branch protection on `main`.** No direct pushes. Branch naming
   `features/<name>/<description>`. All work lands through a reviewed PR.
7. **CI budget policy.** Unit tests and mocked integration tests run on every
   commit; heavy E2E runs on demand rather than on every pull request.
8. **Obsidian vault plus the user-flow diagrams are the source of truth** for
   LLM prompts and design requirements.

## Testing requirements for the final report

Instructor feedback on the PM3 video: the test objectives were good, but the
suite is not reproducible from the report alone. Fixes required:

- **Concrete values for every test case.** Representative examples in the main
  report body, the full value set in an appendix.
- **Define the input domain and data type** for each input (for example integer
  ranges), so test classes and boundaries are derivable by a reader.
- **Use the CE10 test-design format** for each case:
  `Target Unit` (the subject under test), `Test Name / Scenario`, `Inputs`,
  `Expected Outputs`, `Mocked Input/Output pairs` (which dependencies are
  mocked, what fake data they receive, what fake data they return). A "unit" is
  a single class or component - UI, Controller, Service.
- **End-to-end testing:** documentation only in the report. Automate with
  Playwright once the code stack is complete; nat sim considers automated E2E
  superior to manual walkthroughs for reporting.
- **Robustness:** mutation-based fuzzing is sufficient; image-based fuzzing is a
  stretch goal. Include an **overview diagram of the valid/invalid input
  taxonomy** even if the implementation is foundational.

E2E scenarios identified: image upload, sprite generation, the game loop
including leaderboard tracking, and sign-up. See [[Testing Strategy]] and
[[Robustness and Fuzzing]].

## Repository truth on 2026-08-01

Verified by inspection, not by report claim.

| Item | State |
|---|---|
| `origin/main` | `a38e27b` - **PR #7 merged 2026-08-01 15:14 GMT** by Zhi Feng. Vercel and Render reconfigured the same day |
| GenAI pipeline (`server/pipeline`) | **Now on `main`.** Six stages: `identify -> promptCraft -> generate -> removeBg -> finish -> assemble`, with 8 stage test files |
| Dev/admin platform (`server/platform`, `adminRoutes`, `ADMIN_EMAILS` allowlist, `isAdmin`) | On `main` |
| Client pages added | `LandingPage`, `HomePage`, `ScanPage`, `StudioPage`, `AdminPage`, `BackendTestPage` |
| `POST /api/pipeline/run-stream` | Server-sent-event stream over the six stages. **Correction:** this row previously said the route had no auth guard - that was wrong when written; `pipeline.routes.ts` has called `router.use(authMiddleware)` since the platform migration (`627c6b0`, 30 Jul). The route had no persistence as of 2026-08-01 - it did not write `avatar_records`. **Closed on `features/zhifeng/scan-to-archive-persistence`, see below** |
| Playwright | Not installed anywhere in the repo |
| CI | `.github/workflows/tests.yml` only |
| Indicative test-case count | ~261 server + ~80 client `it`/`test` declarations across ~43 files. Re-run the suites before quoting any figure in the report |

### The one real integration gap

> [!success] Resolved on `features/zhifeng/scan-to-archive-persistence`
> Implemented, full server Jest and client Vitest suites green. The PR is not
> open yet - reference the branch name until a merge commit exists (see
> [[Open Questions and Inconsistencies]]).

Two halves of the product used to exist without anything joining them:

- **The pipeline** (from Nat's dev platform) turns a photo into a sprite.
- **The archive** (from Checkoff 3) lists `avatar_records` out of Firestore.

`ScanPage` posts to `/api/pipeline/run-stream`, the six stages stream back, the
sprite renders, and the run now writes an `avatar_records` row before it
completes - a refresh no longer loses the result and the Archive page shows
what was scanned. The **UC6 -> UC4 provenance chain is closed**; see
[[UC6 Upload Plant Picture]] for the updated operation flow.

The three pieces of work that closed it:

1. **Guard the route - already done, the claim below was wrong.** This section
   previously said `server/app.ts:89` mounts `/api/pipeline` with no middleware
   and that `pipeline.routes.ts` applies none either. That was incorrect:
   `pipeline.routes.ts` has called `router.use(authMiddleware)` since the
   platform migration (`627c6b0`, 30 Jul), before this section was even
   written. No route change was needed here; the actual gap was persistence,
   items 2 and 3 below.
2. **Write the record.** `avatarRepository.upsertFromScan` writes the
   identified species, the canonical sprite reference, `source: 'web'`,
   `VISITED`, not temporary, and the discovery timestamps, owned by the
   authenticated caller. Battle stats (hp/attack/defense/speed) are derived
   deterministically from the species key by a pure hash rather than taken
   from the pipeline's own `maxHealth: 100` and `Math.random()` speed, so the
   same species produces the same numbers on every machine and every run.
3. **Honour uniqueness per user/species.** Scanning the same plant twice
   updates `metadata.lastSeenAt` on the existing entry rather than creating a
   duplicate, and upgrades a previously-temporary entry to persistent - the
   rule already written down in
   [[UC4 Browse Avatar Archival#Collection rules]]. The match is on the
   caller's own sanitized species name rather than a formal composite key, is
   not transactional, and only inspects the caller's most recent 1000 records
   - accepted trade-offs, not oversights; see
   [[Open Questions and Inconsistencies]].

This was exactly the 2 Aug "integrate the GenAI pipeline into the main code
stack" task. It also unlocks two of the four E2E scenarios (image upload,
sprite generation), which now have something durable to assert against.

## Conflicts between the meeting notes and the team decisions

| Topic | 30 Jul meeting notes | Later decision / reality | Use |
|---|---|---|---|
| Email domain | Buy a domain to enable OTP and email notification | Justin, 30 Jul 12:52: **do not buy a domain**, keep to the local machine | No domain. Live email delivery stays unproven; use a magic-link or local fallback for the demo |
| Repository architecture | Keep **separate** client and server repositories for API-key isolation | Actual repo `Kopi-O-Kosong-Beng/sprout-web-app` is a single monorepo with `client/` and `server/` workspaces, deployed to Vercel and Render | Monorepo. Do not describe separate repositories in the report. Isolation is achieved by workspace and by host-level environment variables, not by repository split |
| PR reviewer and merger | nat sim reviews and merges everything into `main` | Telegram 30 Jul lists **final reviewer @zhifeeeng**; on 1 Aug nat asks Zhi Feng to review and merge PR #7 "before I hand off" | Zhi Feng owns review, merge, and the Vercel/Render configuration |

## Requirement changes Andrina needs by 2 Aug

PR #7 added surfaces that did not exist when the use case descriptions were
written. Each one is a new or altered actor path, so it changes the
requirements document, the sequence diagrams, and the requirement-change table -
not just the UI. This is the input for the 2 Aug "share what UI changes will be
made" task.

| Change | Affects | Status |
|---|---|---|
| **Landing page routes on authentication** - an unauthenticated visitor lands on a public page; a signed-in user goes to the standard interface; an admin account goes to the admin dashboard | UC2 Login (new post-condition branch) | Implemented |
| **Admin dashboard behind a fixed credential** - `ADMIN_EMAILS` allowlist sets an `isAdmin` flag; the nav link only renders for admins | New admin path; possibly a new use case or a UC2 alternative flow | Implemented |
| **Scan page** - upload a photo, watch the six generation stages stream, see the sprite | UC6 Upload Plant Picture - the operation flow now has visible per-stage progress **and persists to the archive, with first-discoverer attribution** | Implemented on `features/zhifeng/scan-to-archive-persistence`, PR not yet open |
| **A3 Battle with this avatar** - jump straight from an archive entry into PVE with that plant preselected | UC4 (new alternative flow), UC5 (new trigger) | Agreed, not built |
| **Front-facing error toast** - user-visible failure messaging instead of silent failure | Error states across UC1-UC8 | Nat, in progress |

## Open items

- ~~PR #7 review and merge~~ **Done 2026-08-01 15:14 GMT** (`a38e27b`). Vercel and
  Render configured by Zhi Feng the same day.
- ~~**Close the UC6 -> UC4 chain**~~ **Done on `features/zhifeng/scan-to-archive-persistence`.**
  See [[#The one real integration gap]]. Persisted archive record, canonical
  per-species sprite storage, first-discoverer attribution, and deterministic
  battle stats all landed; PR not yet open.
- **Archive -> PVE shortcut.** Omar asked what "A3" under View plant archive
  means. Agreed: add a **"Battle with this avatar"** button that jumps from an
  archive entry straight into PVE with that plant selected. Justin confirmed it
  is more intuitive. This is a new alternative path, so
  [[UC4 Browse Avatar Archival]], the use case description, and the UC4/UC5
  sequence diagrams all need updating - Andrina, Omar, Li Xiang.
- `ADMIN_EMAIL` vs `ADMIN_EMAILS` - the local `server/.env` uses the singular
  name, PR #7 expects the plural. Reconcile before deploying.
- Environment variables to be distributed to the team after integration - Nat
  sent the `.env` to Zhi Feng on 1 Aug for the Vercel/Render configuration.
- GitHub collaboration guidelines markdown file - Nat.
- Repository invitations resent so every member has access - Nat.

## Related

[[Timeline and Milestones]] · [[Team and Roles]] · [[Course Deliverables and Rubrics]] · [[Dell Book Prize Competition]] · [[Testing Strategy]] · [[Robustness and Fuzzing]] · [[Checkoff 3 Readiness and Development Plan]] · [[Open Questions and Inconsistencies]]
