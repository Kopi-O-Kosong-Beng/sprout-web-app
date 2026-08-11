---
tags: [testing, evidence, report, fact-check, final]
owner: Zhi Feng
verified: 2026-08-11
repo: sprout-web-app
status: current
---

# Report Fact-Check — verified figures for the final report

Every figure below was obtained by running a command against the repository,
git history, or GitHub Actions. **Nothing here is estimated.** Where something
could not be determined, it says so.

**How to use this file:** it is the source for the Testing and Robustness
sections. Where it contradicts the current draft, this file is right and the
draft needs changing — the four corrections are listed first.

---

## 0. Corrections the draft needs

| # | The draft says | The truth | Where |
|---|---|---|---|
| 1 | Server tier **45 files / 616 cases** | **Matches no commit measured.** `a57d07a` = 44/603, `f308569` = 44/608, `b184b62` = 46/624 | §2 |
| 2 | Totals **97 files / 1093 cases** | Depends entirely on which commit — see the table in §2. At `b184b62`: **98 / 1101** | §2 |
| 3 | Test run "on commit **f308569**" | `f308569` **was never the tip of `main`.** It is a commit on a feature branch, merged into main later that day | §1 |
| 4 | Fuzzer described only as "8 mutation strategies" | The eight are named in §3; the rubric also asks for **findings**, which are in §4 | §3, §4 |

One more thing the draft must not imply: **CI does not run the full suite.** See
§1.4. "All green in CI" and "1101 tests passed" are two different sentences.

---

## 1. Which commit, and what was green

### 1.1 The two SHAs

```
$ git show -s --format='%H %ci %s' f308569
f308569d6b8b7a2a3b318eca9bb80d793cc13ecf
2026-08-09 13:01:26 +0800
feat(studio): real dex gate, real logs, real observability

$ git show -s --format='%H %ci %s' a57d07a
a57d07a88e81cbcac3b223e422441ce972a972f9
2026-08-09 03:26:54 +0800
Merge pull request #27 from Kopi-O-Kosong-Beng/claude/upbeat-brahmagupta-cc5487
```

### 1.2 Neither contains the other

```
$ git merge-base --is-ancestor a57d07a f308569   # false
$ git merge-base --is-ancestor f308569 a57d07a   # false
$ git branch -r --contains f308569
  → origin/feat/migrate-plantemon-ui-and-dev-platform (and others)
```

- **`a57d07a`** was the tip of `main` for 23 minutes: 03:26 → 03:49 on 9 Aug,
  until `2cf5d5b` (merge of PR #29).
- **`f308569` was never the tip of `main`.** It is a commit on
  `feat/migrate-plantemon-ui-and-dev-platform`, which merged into `main` at
  **`b184b62`** (19:15, 9 Aug, PR #30).
- **Tip of `main` at end of 9 Aug: `b184b62`.** At end of 10 Aug: `f43a039`.

> **Recommended wording for the report:** cite **`b184b62`** and describe it as
> the tip of `main` on 9 August 2026. It is the only 9 Aug commit that is both a
> real state of `main` and contains everything the report describes.

### 1.3 CI conclusions — both all-green

```
$ gh run list --commit <sha>
$ gh api repos/Kopi-O-Kosong-Beng/sprout-web-app/actions/runs/<id>/jobs
```

| SHA | Run | Jobs |
|---|---|---|
| `f308569` | tests 31296504788 | Client ✅ · Server ✅ · E2E ✅ |
| `f308569` | docker 31296504791 | API image ✅ · Frontend ✅ · Compose ✅ · GHCR *skipped* (not `main`) |
| `a57d07a` | tests 31274452400 | Client ✅ · Server ✅ · E2E ✅ |
| `a57d07a` | docker 31274452392 | all four ✅ including GHCR publish |

Both ran on 9 Aug SGT — `a57d07a` at 03:26, `f308569` at 13:21. "The 9 Aug
all-green run" is ambiguous between them; `f308569`'s was a pull-request run on
a feature branch.

### 1.4 CI runs a subset, not the whole suite

`git show b184b62:.github/workflows/tests.yml` shows named groups:

| CI job | Runs | Of the whole suite |
|---|---|---|
| Server focused suites | Groups 1, 2, 3, 4, 7 (+ 9, 10 vitest) | ~20 of 46 Jest files |
| Client focused suites | Groups 5, 6, 8 | **7 of 28 files** |
| End-to-end journeys | `npm run test:e2e` | **all 13** |

**Consequence for the report:** the totals in §2 come from local full-suite
runs. CI proves the focused evidence groups plus the complete E2E tier. Both
statements are true and they are not the same statement — write them separately.

---

## 2. Test counts

Method for every cell: check out the commit, `npm ci`, run each suite to
completion, read the runner's own summary line.

```
server    npx firebase emulators:exec --only firestore --project sprout-test "npx jest --runInBand"
client    npm test -w client
pipeline  npm run test:pipeline -w server
e2e       npx playwright test
```

| Tier | `a57d07a` | `f308569` | **`b184b62`** ← use this |
|---|---|---|---|
| Server (Jest + Supertest + Firestore emulator) | 44 / 603 | 44 / 608 | **46 / 624** |
| Client (Vitest + React Testing Library) | 28 / 309 | 28 / 309 | **28 / 309** |
| Pipeline, ingest gate & fuzzing (Vitest) | 17 / 149 | 18 / 155 | **18 / 155** |
| End-to-end (Playwright, Chromium) | 5 / 11 | 5 / 11 | **6 / 13** |
| **Total** | **94 / 1072** | **95 / 1083** | **98 / 1101** |

**Counting method matters and is worth one sentence in the report:** these are
runner-reported totals, not a grep of `it(` declarations. A static count of the
server suite returns ~416 where the runner reports 603–624, because
parameterised cases expand at runtime.

**The draft's 45/616 matches none of the three.** The only unmeasured commits on
that lineage are `18c0f0c` and `fccf113`; whether either produces 45/616 is
**cannot determine** without measuring them.

**A correction to our own published figure.** The vault, `README.md`,
`docs/TEST_TRACEABILITY.md` and `docs/DELL_METRICS.md` previously said *1074
across 95 files* for `a57d07a`. That measurement was taken with
`e2e/logout.spec.ts` present as an **uncommitted working-tree file** — one file
and two tests that were not in the commit. `a57d07a` as committed is
**94 / 1072**. All four documents corrected 2026-08-11.

---

## 3. The mutation fuzzer

Source: `server/pipeline/fuzz/mutations.ts`, `runner.ts`,
`server/pipeline/__tests__/imageIngest.fuzz.test.ts`. Target:
`server/pipeline/ingest/imageIngest.ts`.

### 3.1 The eight strategies

`MUTATIONS` (mutations.ts:403) contains exactly eight. `random_bytes` and
`random_printable` also exist in that file but are **not** in `MUTATIONS` — they
are the random-testing baseline in `fuzz/baseline.ts`, used to report how many
inputs a purely random generator gets past the gate.

| Name in code | What it mutates | Expected verdict → rejection reason |
|---|---|---|
| `bitflip` | Flips bits at any offset in the file | **either** — a flip in entropy-coded JPEG data still yields a valid image; the same flip in the header destroys it. Hunting crashes and hangs, not a fixed verdict |
| `truncate` | Cuts the file short | **reject** → `truncated` |
| `header_corrupt` | Damages header bytes | **reject** → `unreadable` / `unsupported_format` |
| `format_confusion` | Re-encodes to a different container | **accept** when it picks WebP (on the allow-list); **reject** otherwise → `unsupported_format` |
| `extreme_resize` | Extreme declared dimensions | **reject** → `too_many_pixels` / `too_small` |
| `pixel_noise` | Perturbs pixel data only | **accept** — still a valid image |
| `exif_abuse` | Abuses EXIF metadata | **accept** — unusual metadata is not grounds for refusal |
| `not_an_image` | Substitutes non-image bytes | **reject** → `not_base64` / `unreadable` |

The gate's eight rejection reasons are `missing`, `not_base64`, `too_large`,
`too_small`, `unreadable`, `truncated`, `unsupported_format`, `too_many_pixels`
(`imageIngest.ts`). `missing` and `too_large` are exercised by the unit suite
rather than by a mutation strategy.

**Each mutant declares its own expectation at the point it is built**, rather
than the runner inferring it from the strategy name. That design exists because
of a real defect — see §4.

### 3.2 Seed injection

`runner.ts:128`:

```ts
const rngSeed = options.rngSeed ?? Math.floor(Math.random() * 0x7fffffff);
const rng = createRng(rngSeed);
```

Randomness is **injected, never ambient**. Every mutator takes `rng`. When no
seed is supplied the run picks one and **reports it**, so any finding replays
byte-for-byte from the log alone. CI pins `RNG_SEED = 42`
(`imageIngest.fuzz.test.ts:24`).

### 3.3 Iterations

| Mode | Iterations | Source |
|---|---|---|
| CI (free, offline) | **300** | `const RUNS = 300` — `imageIngest.fuzz.test.ts:25` |
| Live (paid providers) | default **10**, `--runs N` | `fuzz-pipeline-live.ts:48,52` |

### 3.4 Can it run for 24 hours? **No — state this honestly**

`FuzzOptions` (`runner.ts:68`) is:

```ts
{ seeds, runs, sink, rngSeed?, timeoutMs?, mutations?, onFinding? }
```

and the loop (`runner.ts:133`) is:

```ts
for (let iteration = 0; iteration < runs; iteration += 1) {
```

**An iteration count only. There is no duration budget.** `timeoutMs` bounds a
single sink call, not the run. `elapsedMs` is recorded per result for reporting
and is never used as a loop bound.

The brief asks for a fuzzer that *"should be able to run and generate tests over
a very long period (e.g., 24 hours)"*. As written it **cannot be told to do
that**: you could pass a very large `runs`, but there is no deadline, no
graceful stop, and no way to know in advance which count fills 24 hours.

Adding a `durationMs` option to that one loop is a small change. Until it is
made, the report should say the fuzzer is seed-reproducible and CI-gated at 300
iterations per run, and **not** claim long-run capability.

---

## 4. Findings — what the fuzzer actually caught

**Stated plainly: the fuzzer has caught no defect in the ingest gate.** Every
run since the gate landed has been green. Report that rather than implying
otherwise; the rubric rewards findings honestly reported, and a claimed find
that collapses under a question costs more than the gap.

What it *did* catch is a defect in **its own oracle**, and that is a genuine,
tellable finding:

> The first run reported **38 findings. All 38 were harness bugs, not gate
> bugs.** The runner classified expectations by *strategy name*: `bitflip` and
> `format_confusion` were both marked hostile. But a bitflip deep in JPEG pixel
> data still yields a perfectly valid image, and `format_confusion` choosing
> WebP produces a format genuinely on the allow-list. Both were **correct
> acceptances being reported as defects.**
>
> — `md/FUZZ_TESTING.md`, "A Mistake Worth Knowing About"; same account in
> `git show -s 237d8df`

**Fix:** each mutant now declares its own expectation at the point it is built,
since only the mutation knows what it actually produced. **Stated lesson:**
*when a fuzzer reports a finding, confirm the oracle before confirming the bug.*

### The gate itself was a real defect — found by inspection, not by fuzzing

`git show -s 237d8df` records that before the gate,
`POST /api/pipeline/run-stream` took `imageBase64` from a JSON body, **checked
only that it was truthy**, stripped the data-URL prefix with a regex, and posted
the string to Plant.id. All decode, resize and format decisions happened in the
browser — the one part of the path an attacker skips by posting to the endpoint
directly. Garbage was forwarded into the paid provider chain.

Attribute this honestly: it was found while building the harness, because the
fuzzer needed something real to point at. It is a robustness finding; it is not
a *fuzzer* finding.

### Fuzzer-infrastructure fixes (not product defects)

- `920fd77` — `perf(fuzz): stop extreme_resize allocating a gigabyte to test a header rule`
- `4d09e42` — `test(fuzz): cover the studio runner, and stop the replay case timing out`

### A separate finding from verification runs

`e2e/archive-to-battle.spec.ts:25` failed on **2 of 4** full local runs, at both
`f308569` and `b184b62`, always identically:

```
TimeoutError: page.goto: Timeout 20000ms exceeded
  navigating to "http://127.0.0.1:5173/archive"
```

Passed on retry both times; CI has never hit it. Cause: the first Vite
dev-server compile of the `/archive` route on a cold start exceeding the 20 s
navigation timeout. A harness flake, not a product defect — but if the report
claims the E2E tier is green, it is green *on retry*, roughly half the time from
cold on a local machine.

---

## 5. Safe sentences

Copy-paste ready, each backed by something above.

- "At commit `b184b62`, the tip of `main` on 9 August 2026, the suite comprises
  **1,101 automated tests across 98 files**: 624 server integration and API
  tests against the Firestore emulator, 309 client component and routing tests,
  155 pipeline and fuzzing tests, and 13 end-to-end browser journeys."
- "Totals are runner-reported. A static count of `it(` declarations understates
  the server suite by roughly a third, because parameterised cases expand at
  runtime."
- "Continuous integration executes the focused evidence groups on every pull
  request, plus the complete end-to-end tier; the totals above are from
  full-suite runs performed locally."
- "The ingest gate is fuzzed by eight mutation strategies with injected,
  reported seeds, so any finding replays from its log. CI executes 300
  iterations per run."
- "The fuzzer has not found a defect in the gate. Its first run reported 38
  findings, all of which were faults in the harness's own oracle — expectations
  were classified by strategy name rather than by what each mutant actually
  produced. The lesson we took was to confirm the oracle before confirming a
  bug."

## 6. Do not write

- ❌ "1093 tests" / "97 files" / "45 server files" — matches no measured commit
- ❌ "tested on commit f308569, the tip of main" — it was never the tip
- ❌ "all 1101 tests run in CI on every pull request" — CI runs a subset
- ❌ "the fuzzer can run for 24 hours" — no duration budget exists
- ❌ "the fuzzer found N bugs in the gate" — it has found none

## Related

[[Test Inventory 2026-08-09]] · [[Robustness and Fuzzing]] · [[Testing Strategy]] · [[Final Report Grading Rubric]]
