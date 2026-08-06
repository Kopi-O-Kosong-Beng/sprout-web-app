---
tags: [moc, sprout]
---

# Sprout - Knowledge Bank

> **Sprout: Web Platform and B2B Showcase for Nature-Based Gamification**  
> *Scan. Grow. Battle.* - 50.003 Elements of Software Construction (ESC), Cohort 3 Team 2

Sprout turns plant discovery into a nature-learning game: users identify plants, obtain standardized pixel-art creatures, build a persistent collection, and use collected plants in battles. The web application shares product concepts with the Android app while adding server-side orchestration and persistence.

> [!tip] New to this vault?
> Read [[How To Use This Knowledge Base]] first.

## Where we are (updated 2026-08-02)

**Phase: final deliverables.** Checkoff 3 is submitted and the post-checkoff
consultation is done. The active plan is **[[Final Deliverables Plan]]**;
[[Checkoff 3 Readiness and Development Plan]] is now the PM3 record.

- **Final showcase: 11 Aug 2026, 11:30** — 20 min presentation + 10 min Q&A. Team-internal freeze 7 Aug.
- Deliverables: group report (16%), journey + demo slides, recorded video, and a per-member individual report + peer review (5%) — see [[Course Deliverables and Rubrics]]
- **PR #7 merged 2026-08-01** (`a38e27b`) — the GenAI pipeline, the dev/admin platform, and six new client pages are on `main`; Vercel and Render reconfigured
- **UC6 → UC4 chain closed** (PR #8, merged 2026-08-03): scans now persist to `avatar_records`, one canonical sprite per species is reused in Firebase Storage, battle stats are derived deterministically from the species key, and first-discoverer attribution records who found each species first. Remaining open item: the deployed Firebase Storage write path is still unproven — see [[Open Questions and Inconsistencies]]
- Implemented on `main` (`a38e27b`): UC1, UC2 (plus Google sign-in), UC3, UC4, UC5, UC8. **UC7 is design only.** UC6 is implemented end-to-end on `features/zhifeng/scan-to-archive-persistence` — a scan now persists to the archive and survives a refresh, and is no longer a stateless pipeline
- Test position needs re-measuring after the merge — the 293-case PM3 figure is stale; see [[Open Questions and Inconsistencies]]
- Playwright **is installed and green** (PR #24, 6 Aug): 6 end-to-end specs run on every pull request against the real stack — see [[Testing Strategy]]
- Known gap, now permanent: no email domain will be purchased, so live email delivery stays unproven. Disclose it
- Zhi Feng is the **final PR reviewer/merger** and owns the Vercel and Render configuration — see [[Team and Roles]]

## Map of Content

### 01 Project

- [[Project Overview]] - product and repository context
- [[Problem and Value Proposition]] - problem, users, and differentiators
- [[Team and Roles]] - ownership and workload evidence
- [[Course Deliverables and Rubrics]] - grading requirements
- [[Timeline and Milestones]] - current delivery schedule

### 02 Requirements

- [[Feature Priorities]] - Checkoff 3 integrated, regression, isolated, and planned scope
- [[Use Case Model]] - canonical UC1-UC8 and current relationships
- [[UC1 Signup]] · [[UC2 Login]] · [[UC3 Reset Password]] · [[UC4 Browse Avatar Archival]] · [[UC5 PVE Battle]] · [[UC6 Upload Plant Picture]] · [[UC7 PVP Battle]] · [[UC8 Submit Query Ticket]]
- [[Non-Functional Requirements]] - security, testability, and performance targets

### 03 Design

- [[System Architecture]] - MVC/BCE layers and adapter boundaries
- [[Domain Model]] - current class/domain vocabulary
- [[Database Schema]] - species, canonical assets, collections, scans, battles, and tickets
- [[API Contract]] - current and target endpoints
- [[GenAI Sprite Pipeline]] - canonical species sprite generation and FLORENTINE24 lock
- [[Sequence Diagram Plan]] - standardized Checkoff 3 diagram set
- [[UI Design System]] - frontend visual conventions

### 04 Tech Stack

- [[Tech Stack Decision]] - platform choices
- [[External APIs]] - Firebase, identification, generation, background removal, storage, and email
- [[Firebase Storage Activation]] - billing, bucket, rules, environment, and live preflight checklist

### 05 Testing

- [[Testing Strategy]] - lifecycle, unit, integration, system, and robustness strategy
- [[Test Matrix]] - Checkoff 3 test cases and evidence status
- [[Robustness and Fuzzing]] - final-stage robustness targets

### 06 Meetings and Feedback

- **[[Final Deliverables Plan]]** - the active plan for the 11 Aug showcase: dates, owners, decisions, repository truth
- **[[Zhi Feng Task List]]** - my own checklist for the final phase
- [[Checkoff 1 Feedback]]
- [[Checkoff 2 Plan]]
- [[Checkoff 2 Consultation Minutes]]
- [[Checkoff 3 Readiness and Development Plan]]
- [[Checkoff 3 Requirement Changes]] - PM3 requirement/design change tables
- **[[Checkoff 3 Submission]]** - the six-section PM3 report to hand in
- **[[Checkoff 3 Test Plan and Test Cases]]** - test plan, strategy justification, and 56 test cases
- [[Checkoff 3 Report]] - long-form evidence appendix behind the two documents above

### 07 Decisions and QA

- [[QA Database Schema]]
- [[QA Sprite Storage and Web Cache]]
- [[QA Locality Data]]
- [[Open Questions and Inconsistencies]]

### 99 Sources

- [[Source Index]] - raw-dump inventory and provenance

### Knowledge graph

- [graphify-out/graph.html](graphify-out/graph.html) - generated vault/code graph; currently predates the 20 Jul Checkoff 3 rewrite
- [graphify-out/GRAPH_REPORT.md](graphify-out/GRAPH_REPORT.md) - generated graph summary; regenerate after the implementation/docs freeze
