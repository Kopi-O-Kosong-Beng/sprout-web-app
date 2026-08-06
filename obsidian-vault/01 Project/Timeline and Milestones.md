---
tags: [project, timeline, checkoff3, final]
source: Timeline.xlsx, ESC_C3T2_MP1_markdown.md, team planning 2026-07-20, meeting 2026-07-30, team Telegram 2026-07-30 to 2026-08-01
updated: 2026-08-01
---

# Timeline and Milestones

The project follows an iterative/agile delivery cycle: each increment adds progression tests for new behavior and regression tests for earlier features.

| Milestone | Status | Due | Weight |
|---|---|---|---|
| PM1 video/checkoff | Completed | Jun 2026 | 5% |
| PM2 video/checkoff | Completed | 12/16 Jul 2026 | 5% |
| PM3 video | Completed | 26 Jul 2026 | about 1% |
| PM3 checkoff | Completed | 30 Jul 2026 consultation | about 4% |
| **Final presentation/demo** | **Current** | **11 Aug 2026, 11:30** - 20 min presentation + 10 min Q&A | 5% |
| Group report | Current | team freeze 7 Aug 2026 | 16% including possible bonus |
| Individual report/peer review | Current | "next week" from 31 Jul, exact date not confirmed | 5% |

## Final phase critical path (2 - 11 Aug)

Owners and full detail in [[Final Deliverables Plan]].

| Due | Exit condition | Owner |
|---|---|---|
| 2 Aug | Report requirements/use case descriptions, feature progress, and sustainability/D&I drafted | Andrina |
| 2 Aug | Planned UI changes published so use case descriptions can be updated concurrently | Omar, Justin |
| 2 Aug | **GenAI pipeline integrated into the main code stack** (requires PR #7 merged first) | Nat, Zhi Feng |
| 5 Aug | All UI improvements merged | Omar, Justin |
| 5 Aug | Unit / integration / E2E / robustness report documentation finalised | Nat, Zhi Feng |
| 6-7 Aug | Class and sequence diagram changes finalised against the final code | Li Xiang, Omar |
| 6-7 Aug | Backup demo video recorded | Nat |
| 7 Aug | Report finished; 5-minute recording slides drafted | Andrina, Justin |
| 11 Aug | Final showcase delivered | all |

## Checkoff 3 critical path (historical)

| Date | Status | Exit condition | Main backend/cloud/testing work |
|---|---|---|---|
| 20 Jul | Done | Requirements and architecture decisions recorded | Auth, canonical storage target, palette, PVE rewards, diagram vocabulary, and test strategy |
| 21 Jul | Done | Auth/email automated evidence recorded | Firebase verification boundary, route gating, reset/ticket behavior, and historical Node 22 evidence; live Firebase/inbox remained separate |
| 22 Jul | Done | Firestore-only archive/PVE backend increment established | Active SQLite runtime removed; Firestore avatar records/demo data, battle engine, repository/transactions, and HTTP API implemented |
| 23 Jul | Done | Focused UC4/UC5 suites passed at commit under test `7991254` under Node.js `v22.23.1` | Six non-overlapping focused command groups: 223 passing assertions across 11 files; no broad regression claim |
| 23 Jul | Current | Focused evidence and report documentation synchronized | First draft artifact `d2cc497`; corrected grading/report artifact `5bc87d` containing the split taxonomy and timeline; test matrix/strategy, truth boundaries, timeout qualification, planned system rows, and evidence paths |
| 24 Jul | Planned | Real-browser system check recorded | Browser Back/Forward and full browser-to-backend Archive-to-PVE journey; live Firebase/config and production Firestore remain explicit if unavailable |
| 25 Jul | Planned | Traceability and video proof match current code | Use case -> sequence -> code -> test -> screenshot/video timestamps; UC6 upload/pipeline remains planned unless separately implemented and evidenced |
| 26 Jul | Planned | PM3 evidence freeze | Final review, rehearsal, backup, and explicit disclosure of every not-run live/system case |

The full daily exit criteria are in [[Checkoff 3 Readiness and Development Plan]].

## Scope protection

1. Protect the focused Archive/PVE evidence already implemented and tested.
2. Keep auth and Contact Us as supporting historical regression evidence until a broader rerun is intentionally performed.
3. Do not let `avatar_records` archive evidence imply that the planned UC6 upload/identification/AI pipeline exists.
4. Keep PVP and advanced leaderboard work in the planned architecture.
5. Freeze diagrams after the implementation freeze so they describe actual code.

## Risk register

| ID | Risk | Control |
|---|---|---|
| R01 | AI provider unavailable, slow, or out of quota | Adapter interfaces, deterministic fakes, seeded canonical assets |
| R02 | API/SMTP credentials exposed | Backend-only environment variables, secret scan, hide values in evidence |
| R03 | Malicious/oversized upload | Magic-byte validation, size limit, rate limit, boundary/fuzz tests |
| R04 | Duplicate generation | Versioned unique recipe key and generation lock |
| R05 | Firebase Storage billing/credential delay | Local seeded adapter through the same interface |
| R06 | PVE/PVP scope creep | Isolated PVE evidence; PVP remains planned |
| R07 | Test evidence too late | Test cases written with each module and mapped to UC/sequence messages |
| R08 | Diagram/code drift | Implemented/planned labels and a final traceability review |
| R09 | Contribution evidence unclear | Owners, commit links, test names, screenshots, and video timestamps |
| R10 | PR #7 unmerged blocks the 2 Aug pipeline integration and every downstream UI branch | Review and merge first; treat it as the single critical-path dependency |
| R11 | Six people branching off one repo with a free-tier Vercel/Render account | Branch protection on `main`, `features/<name>/<description>` naming, one reviewer (Zhi Feng) resolving conflicts |
| R12 | Demo failure invites scrutiny of the testing documentation | Demo only tested features; record a backup video by 7 Aug |
| R13 | No purchased domain, so live email delivery stays unproven | Magic-link or local fallback for the demo; disclose the boundary in the report |

## Related

[[Final Deliverables Plan]] · [[Checkoff 3 Readiness and Development Plan]] · [[Course Deliverables and Rubrics]] · [[Testing Strategy]] · [[Test Matrix]]
