---
tags: [project, team, workload]
source: ESC_C3T2_MP1_markdown.md, Timeline.xlsx, team chat, team Telegram 2026-07-30 to 2026-08-01
updated: 2026-08-01
---

# Team and Roles

**Cohort 3 Team 2:** Nathaniel Sim (@snatnim), Justin Teh (@justin_tehh), Omar Fayaz (@omar_fayaz), Andrina (@Angrinaa), Li Xiang (@currychicken88), and Zhi Feng (@zhifeeeng).

Sprout startup founders (Baby Shark): Nathaniel Sim, Teo Li Zhong, and Imelda.

## Final phase ownership

Agreed by Justin on 2026-07-31 as the shared baseline every member should use
when writing their individual report. Full task timeline in
[[Final Deliverables Plan]].

| Area | Owners |
|---|---|
| Checkoff documentation | Andrina |
| Use cases | Justin, Andrina |
| Class and sequence diagrams | Andrina, Li Xiang, Omar |
| Testing | Nat, Zhi Feng, Andrina |
| Backend - database and email server | Zhi Feng |
| Backend - GenAI pipeline | Nat |
| Frontend - signup, login, reset, contact us | Zhi Feng, Justin |
| Frontend - landing page | Nat, Justin |
| Frontend - view sprite and upload plant picture | Li Xiang, Omar |
| PVE | Zhi Feng, Nat |

### Process ownership

**Zhi Feng is the final reviewer and merger** for pull requests into `main`, and
owns the Vercel and Render configuration. Nathaniel held this role during
Checkoff 3 and handed it over on 2026-08-01; the 30 Jul meeting notes still
record the older arrangement. Nobody pushes to `main` directly; branch names
follow `features/<name>/<description>`.

## Checkoff 3 role focus (historical)

| Member/role | Primary focus | Evidence expected |
|---|---|---|
| Requirements/project coordination | Scope, current use cases, report/video narrative | Requirement-change log, current diagrams, demo script |
| Frontend | Upload, archive, auth verification, Contact Us, PVE controls | Components, frontend unit tests, integrated demo |
| AI/game design | Prompt recipe, FLORENTINE24 design lock, moves/NPC data | Versioned design data, reference outputs, review evidence |
| **Zhi Feng: backend, cloud infrastructure, and testing** | Scan orchestration, Firebase Storage, canonical persistence, PVE state/rewards, auth/email readiness, test strategy | Commits, tests, deployment evidence, report tables |

## Zhi Feng Checkoff 3 ownership

| Deliverable | Definition of contribution evidence |
|---|---|
| Scan service and stable errors | Route/service commits and linked unit/integration tests |
| Canonical sprite storage | Storage paths/rules, adapter implementation/tests, cache-hit/cache-miss demo |
| FLORENTINE24 post-processing | Quantizer code/test output proving 56x56, alpha, palette closure, determinism |
| Firebase/SMTP deployment | Configuration screenshots with secrets hidden and real-inbox evidence |
| Auth regression | Verification/resend, route guard, reset OTP tests and deployed walkthrough |
| PVE backend | State transition, seeded RNG, stale-turn, and idempotent reward tests |
| Testing/report | Strategy paragraph, table-form cases, actual results, traceability links |

## Workload-evidence rule

The rubric can apply an individual penalty when contribution evidence is unclear. Each feature row in the report should link to a named owner, exact source module/commit, test case, and demo timestamp. Keep screenshots focused and never expose environment secrets.

## Related

[[Final Deliverables Plan]] · [[Checkoff 3 Readiness and Development Plan]] · [[Timeline and Milestones]] · [[Course Deliverables and Rubrics]]
