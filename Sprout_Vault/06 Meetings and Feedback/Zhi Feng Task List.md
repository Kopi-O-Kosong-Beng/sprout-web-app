---
tags: [tasks, final, zhifeng]
owner: Zhi Feng
created: 2026-08-02
updated: 2026-08-06
status: active
---

# Zhi Feng - Task List (final phase)

Everything assigned to me between now and the deadlines. Team-wide plan and
owners in [[Final Deliverables Plan]]; the Dell track in
[[Dell Book Prize Competition]].

Three roles now: **backend/testing contributor**, **final PR reviewer/merger +
owner of the Vercel and Render configuration**, and (new, 6 Aug)
**containerization + Cloud Native section owner** for the Dell competition.

## Hard dates

| Date | What |
|---|---|
| 7 Aug | Team freeze; report finished; slides drafted (my slide inputs due) |
| 10 Aug | Dell interest email (Justin sends; my artifacts should exist by then) |
| **11 Aug 12:30pm** | **Showcase, TT6 (1.416)** + Dell Dockerfile/image shared |
| 14 Aug 2-4pm | Dell pitch at Dell office (if shortlisted 13 Aug) |
| **15 Aug 2359** | **Peer evaluation — skipping it zeroes my individual report** |
| 16 Aug 2359 | Final report, individual report, slides, 7-min video, code |

---

## Done (verified against origin/main, 6 Aug)

- [x] PR #7 merged 1 Aug (`a38e27b`); Vercel + Render configured.
- [x] UC6 → UC4 scan-to-archive persistence (PR #8, merged).
- [x] PRs #10-#20 reviewed/merged through 5 Aug — leaderboards, battle
      cinematic, admin/operator tier, Justin's frontend refactor (#18, the
      256-file conflict), sprites + full XP board, scan polish (#20).
- [x] `ADMIN_EMAILS` (plural) and `FIREBASE_STORAGE_BUCKET` carry real values
      in `render.yaml` — both old worries closed.
- [x] A3 "Battle with this avatar" implemented (`ArchivePage.tsx`); the
      *diagram/description* update remains with Andrina/Omar/Li Xiang.
- [x] Sprite assets + `spriteAssets.test.ts` drift guard on main; one shared
      `sprites:generate` generator.
- [x] Individual report drafted (`individual-report-zhifeng-draft.md`, repo
      root of the workspace) — needs trim to 3 pages, then submission by 16 Aug.

## 1. Merge queue — CLEARED (6 Aug)

- [x] **PR #22 (Nat)** merged — image ingest gate, mutation fuzzer,
      `md/FUZZ_TESTING.md`, `fuzz-live.yml`. Fuzzing write-up is now Nat's.
- [x] **PR #21 (Omar)** merged — Archive/Scan UI polish. `main` at `6f3949b`,
      zero open PRs at the time of writing.
- [ ] **PR #23 (mine)** — cloud-native + containerization. **All CI green**
      (run 31097344997). Needs a teammate's review approval to merge — branch
      protection blocks self-approval. See [[Cloud Native and Containerization]].
- [ ] Keep main deployable; warm Render before any recording (~1 min cold start).

## 2. Containerization — BUILT, in PR #23 (6 Aug)

The 4 Aug "report-only" decision is **superseded**: Kenny's email requires the
product deployed **and containerized**, submission = Dockerfile + image on
11 Aug. Implementation log, evidence table and report-ready prose in
[[Cloud Native and Containerization]].

- [x] `server/Dockerfile` — 3-stage Debian slim, workspace-aware `npm ci`,
      non-root, HEALTHCHECK on `/api/health`, exec-form CMD so SIGTERM reaches
      Node.
- [x] `client/Dockerfile` + `client/nginx.conf` — Vite build → nginx, SPA
      routing mirrors `vercel.json`.
- [x] `docker-compose.yml` + `docker/firestore-emulator/` — client + API +
      the Java emulator, one command, zero secrets.
- [x] Resiliency gaps closed: graceful shutdown (12-factor IX, was the one
      factor we outright failed) and the liveness/readiness split.
- [x] `.github/workflows/docker.yml` — builds and smoke-tests both images and
      the compose stack, publishes to GHCR from main. **This is the
      verification path: no Docker on my machine, so CI is what proves the
      images.**
- [x] CI green; run link, image size (464 MB) and smoke-test values recorded in
      the log.
- [ ] Get PR #23 reviewed and merged (needs someone else to approve).
- [ ] Rework `sprout-app/docs/dell-docker-report.md` SHIPPED/PROPOSED labels
      now that artifacts exist (the file is still untracked by git).
- [ ] Post-showcase (11→14 Aug): consider flipping Render to `runtime: docker`.
      **Not before 11 Aug** — presentational benefit, live-demo risk.
- [ ] Stretch, only if the report is done: k8s manifests for the
      `server/pipeline/` seam, PROPOSED unless actually applied.

## 3. Cloud Native Design & Architecture Rationale and Resiliency (slide input by 7 Aug)

- [ ] 1-min slide content for Justin (with speaker notes). Source material is
      ready: the 12-factor audit and resiliency inventory in
      [[Cloud Native and Containerization]] — lead with the audit, it gives the
      minute a spine instead of a feature list.
- [ ] Matching report subsection (this doubles as Dell criterion #3, 20%).
- [ ] Rehearse the two likely Q&A answers: why no Kubernetes (liveness/readiness
      split implemented without the cluster; `server/pipeline/` named as the one
      seam), and does it scale horizontally (domain state yes, rate-limit
      counters would move to a shared store).

## 4. Test documentation for the report (7% of the module — my biggest block)

PM3 feedback: objectives good, **suite not reproducible from the report alone**.
Write directly into Justin's SharePoint final-report doc.

- [ ] **Re-measure the suites AFTER #22/#21 land** — the 3 Aug figure
      (522 tests / 52 files) is stale; do not quote any old number.
- [ ] Rewrite test cases in **CE10 format**: Target Unit / Test Name-Scenario /
      Inputs / Expected Outputs / Mocked Input-Output pairs. A "unit" is one
      class or component (UI / Controller / Service).
- [ ] Concrete values — examples in body, full set in appendix. Domain
      (range) + data type for every input.
- [ ] **Hyperlink each test suite to the sequence diagram it covers**
      (6 Aug consult requirement).
- [ ] E2E: documentation-only is acceptable; "starts from user, ends with
      user". Playwright still not installed (verified 6 Aug) — do not block on
      Nat's automation.
- [ ] Robustness: **valid/invalid input taxonomy diagram** (highest
      score-per-hour item). PR #22's `FUZZ_TESTING.md` supplies the image-gate
      classes; add the text-input side and draw the overview diagram.
- [ ] Disclose the pipeline mock layer wherever mocked results are reported.

## 5. Implementation challenges write-up (2%, with Nat)

Rubric: full marks only when each challenge states **how it was addressed**.
Candidates with fixes already collected: Jest 29/30 hoisting collision under
the emulator; Render SMTP blackhole → Resend HTTPS; Firestore transactions
with retry/replay under test; joining the pipeline and archive halves; the
silent `ifGenerationMatch` precondition; the wire-format mismatch two green
suites hid. Add: the 256-file PR #18 merge as "production merging" material
(the preso slot pairs the two).

- [ ] Algorithmic / Engineering / Testing subsections drafted into the report.

## 6. Report items to highlight (Justin's calls)

- [ ] **Email-server constraint**: without a purchased domain + MX config,
      signup verification and reset OTP deliver to one specific email only.
      Feature works, scope constrained — say it explicitly (my subsystem).
- [ ] UX-over-UI emphasis, security protocol, deployability, fuzzer — mirror
      the preso layout in the report.

## 7. Presentation slots I own (11 Aug)

- [ ] Cloud Native minute (with Justin).
- [ ] Test-suite segment share of 7 min (with Nat, Justin, Omar).
- [ ] Implementation-challenges minute (with Nat).

## 8. Individual report + peer eval

- [ ] Trim draft to 3 pages, strip bracketed PR pointers; submit by 16 Aug.
- [ ] **Peer evaluation by 15 Aug 2359** — the zero-risk item.

## Related

[[Final Deliverables Plan]] · [[Dell Book Prize Competition]] · [[Course Deliverables and Rubrics]] · [[Testing Strategy]] · [[Robustness and Fuzzing]] · [[Open Questions and Inconsistencies]]
