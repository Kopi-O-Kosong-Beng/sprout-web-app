# Checkoff 3 Core Testing Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce focused, truthful Checkoff 3 unit and integration evidence for the implemented archive and PVE use cases without adding unrelated regression coverage.

**Architecture:** Pure PVE rules are verified as Jest unit/property tests. Backend route-to-Firestore behavior is verified with Jest, Supertest, and the Firestore emulator; React page orchestration is verified with Vitest and React Testing Library. Report evidence distinguishes these layers from optional browser system testing and earlier auth/contact regression.

**Tech Stack:** Node 22, TypeScript, Jest, fast-check, Supertest, Firebase Firestore Emulator, Vitest, React Testing Library.

## Global Constraints

- Run only focused archive/PVE suites while preparing this deliverable.
- Add a test only for a demonstrated Checkoff 3 gap or an observed core defect.
- Do not delete existing tests unless a case is duplicate or obsolete.
- Keep core Checkoff 3 evidence separate from supporting regression.
- Do not push or merge.
- Commit author is `Zhi Feng <zhifeng_chia@mymail.sutd.edu.sg>` with no co-author metadata.

---

### Task 1: Close Focused Archive API Evidence Gap

**Files:**
- Create: `server/tests/avatar-api.test.ts`

**Interfaces:**
- Exercises: `GET /api/avatar`, `GET /api/avatar/:avatarId`
- Uses: verified Firebase token mock and real Firestore emulator
- Produces: black-box archive HTTP integration evidence for UC4

- [ ] **Step 1: Write failing black-box cases**

Cover a verified new user receiving an empty page, owner-only listing with bounded pagination, owner-only detail lookup, and indistinguishable missing/foreign `404` responses.

- [ ] **Step 2: Run only the new Jest suite through the Firestore emulator**

Expected initial result: any missing route/ownership behavior fails with an HTTP assertion, not an implementation-detail assertion.

- [ ] **Step 3: Make the smallest production correction only if a focused case exposes a defect**

Do not refactor unrelated avatar code.

- [ ] **Step 4: Rerun the focused archive suites**

Run `avatar-api.test.ts`, `avatar-demo.test.ts`, and `firestore-only-runtime.test.ts` only.

- [ ] **Step 5: Commit**

Commit the focused tests and any required narrow fix.

---

### Task 2: Add Compatibility and Authority Tests for Observed PVE Defects

**Files:**
- Modify: `server/tests/battle-repository.test.ts`
- Modify: `server/tests/battle-api.test.ts`
- Modify: `client/src/pages/BattlePage.test.tsx`
- Modify only as required: `server/data/battle-catalog.ts`
- Modify only as required: `server/controllers/battle.controller.ts`
- Modify only as required: `server/repositories/battles.ts`
- Modify only as required: `server/services/battle.service.ts`
- Modify only as required: `client/src/pages/BattlePage.tsx`
- Modify only as required: shared client navigation components

**Interfaces:**
- Preserves: stored `thornback-v1` session compatibility
- Produces: server-authoritative avatar battle eligibility
- Prevents: route/logout navigation while a non-idempotent start or replay request is pending

- [ ] **Step 1: Write failing focused tests**

Add a legacy-session fixture that decodes the original `thornback-v1` sprite snapshot, a public-response assertion that suppresses the broken bot URL without rewriting stored v1 data, an authoritative eligibility assertion that does not depend on the browser clock, and a rendered-app navigation lock assertion covering the shared header during start/replay.

- [ ] **Step 2: Run only the named PVE suites**

Expected initial result: each observed defect fails for the reason reported by independent review.

- [ ] **Step 3: Implement compatible fixes**

Keep the persisted v1 preset unchanged, redact/normalize only the public bot visual field, keep player sprite validation strict, expose server-authoritative eligibility, and apply a scoped pending-navigation guard.

- [ ] **Step 4: Rerun focused PVE tests**

Run the battle catalog, engine/property, repository, API, and BattlePage suites only.

- [ ] **Step 5: Commit and obtain independent review**

Do not claim completion until compatibility, authority, and navigation findings are review-clean.

---

### Task 3: Synchronize Checkoff 3 Test Plan and Evidence

**Files:**
- Create: `docs/checkoff3/archive-pve-verification-evidence.md`
- Modify: `D:/SUTD/Term5/ESC/Sprout_WebApp/Sprout_Vault/05 Testing/Test Matrix.md`
- Modify: `D:/SUTD/Term5/ESC/Sprout_WebApp/Sprout_Vault/05 Testing/Testing Strategy.md`
- Modify: `D:/SUTD/Term5/ESC/Sprout_WebApp/Sprout_Vault/01 Project/Timeline and Milestones.md`
- Modify only if needed: `D:/SUTD/Term5/ESC/Sprout_WebApp/Sprout_Vault/01 Project/Course Deliverables and Rubrics.md`

**Interfaces:**
- Documents: exact implemented tests, commands, results, commits, and evidence paths
- Separates: core UC4/UC5 evidence, supporting regression, and planned system checks

- [ ] **Step 1: Replace stale planned statuses with verified truth**

Record the exact focused test results. Keep unrun browser, live Firebase, and full-stack system journeys marked `Planned`.

- [ ] **Step 2: Add report-ready tables**

Each row contains test ID, use case, strategy, tool, expected result, actual result, and evidence path.

- [ ] **Step 3: Explain techniques and integration orders**

Name black-box equivalence/boundary/state-transition cases and white-box branch/path/invariant/property cases. Compare decomposition top-down/bottom-up with call-graph top-down/bottom-up/pairwise, then state which order each suite actually uses.

- [ ] **Step 4: Add tools, scenarios, and a completed/future timeline**

Show dates, owner, completed focused suites, video/browser evidence still planned, and final freeze activities.

- [ ] **Step 5: Run documentation consistency checks and commit each repository separately**

Check obsolete `Planned` PVE/archive claims, stale SQLite runtime claims in touched pages, table completeness, and `git diff --check`.

