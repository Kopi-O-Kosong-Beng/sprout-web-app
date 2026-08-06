---
tags: [handover, final, zhifeng]
owner: Zhi Feng
created: 2026-08-03
status: active
---

# Session Handover - 2026-08-03

State at the end of the scan-to-archive session, so the next session starts cold
without re-deriving anything. Task list: [[Zhi Feng Task List]].

---

## What just landed

**[[Zhi Feng Task List]] section 1 (UC6 -> UC4) is done and in review.**

**PR #8** - https://github.com/Kopi-O-Kosong-Beng/sprout-web-app/pull/8
Branch `features/zhifeng/scan-to-archive-persistence`, 22 commits off `a38e27b`.
Not merged. `main` untouched.

A completed web scan now writes: a canonical per-species sprite to Firebase
Storage, an `avatar_records` row for the caller de-duplicated on the sanitized
species name, deterministic battle stats derived from the species key, and a `dex`
record naming the first discoverer.

Green at merge time: server Jest 32 suites / 399 tests under the emulator, client
Vitest 12 files / 87 tests, server pipeline Vitest 8 files / 36 tests,
`npm run typecheck` clean. Full breakdown in [[Test Inventory 2026-08-03]].

### Corrections to earlier assumptions

Three things the design doc asserted were false, and are now fixed in the spec
itself so the report does not repeat them:

1. **The pipeline routes were already authenticated.** `pipeline.routes.ts:39` has
   had `router.use(authMiddleware)` since `627c6b0`, and `app-config.test.ts:46`
   already asserted the 401. The design's "the route is open" claim was never true
   on this branch's base.
2. **The client already sent the ID token.** `pipelineStream.ts:26-33` has
   `authHeaders()`; the design's claim that `ScanPage` called `fetch` bare was wrong.
3. **Scope listed pipeline auth as work to do** - corrected to match.

### Two bugs worth knowing about (good section 4 material)

- **A concurrency guard that did nothing.** The create-only precondition on the
  first sprite upload was written as a top-level `ifGenerationMatch: 0`, but
  `@google-cloud/storage` only reads `options.preconditionOpts.ifGenerationMatch`.
  It was silently never sent. `tsc` could not catch it because the injected
  `SpriteStorageFile` types options as `unknown`. Caught only by a reviewer reading
  the SDK sources.
- **Server and client disagreed on the wire format.** The `complete` event shipped
  a raw `DexDiscovery` (`firstDiscoveredBy`, a UID) while `ScanPage` read
  `firstDiscoveredByName`/`isFirstDiscoverer`. Both were `undefined` at runtime, so
  "You discovered this first!" could never render and every scan showed a dangling
  "First discovered by ". Both sides passed their own tests because the client's
  test fixture encoded the wrong shape. Fixed by extracting
  `server/services/discovery.ts` as the single resolver both surfaces use.

Both are "engineering / testing challenge, and here is how it was caught" material
for section 4, which the rubric only awards full marks for when the fix is stated.

---

## Next up: section 2, test documentation (due 5 Aug, with Nat)

This is what Justin asked for. The blocker is cleared - [[Test Inventory 2026-08-03]]
has the fresh counts and the per-file breakdown, so the "do not quote a number
without a fresh run" rule is satisfied.

Remaining for section 2:

- Rewrite cases in **CE10 format** - Target Unit / Test Name-Scenario / Inputs /
  Expected Outputs / Mocked Input-Output pairs.
- Fill in **concrete literal values**, representative ones in the body and the full
  set in an appendix.
- State the **domain and data type of every input** (e.g. "integer, 1..999").
- The mock layer is now disclosed in [[Test Inventory 2026-08-03#Mock layer disclosure]] -
  fold that into the report.

**Head start:** the scan-to-archive design doc's Testing table is already
target-unit / scenario / expected, which is CE10 minus Inputs and Mocked pairs -
`sprout-app/docs/superpowers/specs/2026-08-02-scan-to-archive-persistence-design.md`.
The 43 new cases from this session are the easiest to write up because their inputs
are literal and already pinned. In particular `species-stats.test.ts` pins exact
derived values (`monstera_deliciosa` -> hp 110, attack 49, defense 61, speed 35),
which is exactly the "concrete value" the rubric wants.

Also unblocked: **section 7 (Playwright E2E)** was explicitly sequenced after
section 1 because scan-to-archive and archive-to-battle had nothing durable to
assert on. They do now.

---

## Open items carried forward

**Blocking the showcase if missed:**

- `FIREBASE_STORAGE_BUCKET` must be set in the **Render** environment or every
  sprite write fails in production. The deployed Storage path has only ever had an
  Admin preflight (2026-07-21) - this is the least-proven part of the feature.
- Confirm the deployed env uses `ADMIN_EMAILS` (plural), not the singular
  `ADMIN_EMAIL`. On a mismatch admin routing fails silently. Still unticked from
  section 1.

**Known limitations, deliberately accepted** (already recorded in
[[Open Questions and Inconsistencies]]):

- De-duplication is not transactional and inspects only the caller's most recent
  1000 records. Consistent with the design's filter-then-work-in-memory decision.
- `/run-stage2c` persists `speciesFamily: null` - its synthetic identification
  carries no taxonomy. That route is only used by the internal dev studio
  `PipelineStudio.tsx`, not the user-facing `ScanPage`.
- `tests/app-config.test.ts` runs in **no CI group**, so its pipeline-auth 401
  assertions are not enforced by CI. Pre-existing; worth a one-line CI fix.
- `ScanPage.tsx` maps any error message containing `401` to a sign-in prompt, and
  treats an absent `saved` field as success. Both latent, both plan-specified.

**Housekeeping:**

- `GOOGLE_SMTP_VERIFICATION_PLAN.md` is untracked in the repo root and was left
  alone deliberately - it proposes a database-only UC8 that contradicts the agreed
  requirement.
- `PipelineStudio.tsx:322-333` still writes the `dex` collection directly with
  `firstDiscoveredBy: user.email`, which would overwrite the UID and wipe
  `discoveryCount`. `firestore.rules:16` denies all client access so it is latent,
  but it is now a live schema collision rather than a harmless leftover.

---

## Environment notes

- **Jest**: always `node node_modules/jest/bin/jest.js` from `server/`. A bare
  `jest` resolves to the root-hoisted jest 30 and dies with
  `clearMocksOnScope is not a function`.
- **Emulator**: needs Java on PATH. Stray `java.exe` processes hold port 8080
  between runs - kill them before starting, or the emulator refuses to boot.
- **Vault is a separate repo** (`sprout-knowledge-base`) - commit it separately
  from `sprout-app`.
- **Pushing**: the default credential helper hangs non-interactively and `wincred`
  no longer works. Use the `gh auth token` header method recorded in
  [[Final Deliverables Plan]].
- **No `Co-Authored-By` trailers** on any commit - it corrupts the
  individual-contribution evidence graders inspect.

## Related

[[Zhi Feng Task List]] · [[Test Inventory 2026-08-03]] · [[Final Deliverables Plan]] · [[Open Questions and Inconsistencies]] · [[Testing Strategy]]
