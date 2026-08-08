# Fuzz Testing

This document has two halves.

**Part 1 (built, green)** covers the image ingest gate and the fuzz harness that
tests it: what they are, how to run them, how to read a finding, and how to
extend them.

**Part 2 (roadmap)** is the work not yet done — metamorphic oracles,
generation-based fuzzing, a genetic search, and a second harness for the text
entry points. It is written as implementation instructions, in dependency order,
with acceptance criteria for each item. Nothing in Part 2 exists yet; do not
document it as if it does.

---

# Part 1 — The Image Harness

## One-Minute Summary

Two things were built together, and neither makes sense without the other.

```text
The gate    server/pipeline/ingest/imageIngest.ts
            validates untrusted image bytes at both pipeline entry
            points. Runs on every scan.

The fuzzer  server/pipeline/fuzz/
            mutates real plant photos and feeds them to that same
            function, checking it never crashes, hangs, or misjudges.
```

Both entry points are guarded:

| Route | Payload | Audience |
|---|---|---|
| `POST /api/pipeline/run-stream` | the camera photo, before Plant.id | `photo` |
| `POST /api/pipeline/run-stage2c` | the sprite echoed back through the studio's human gate | `sprite` |

Same rules on both. `audience` only changes the wording of a rejection: there
is no photo at stage 2c, so "try taking the photo again" would be nonsense
there.

The fuzzer calls **the same function players hit**, not a copy. That is the
whole point: a green fuzz run is a statement about production code.

| Mode | Trigger | Calls paid APIs? | Command |
|---|---|---|---|
| CI | every PR + push, and the studio page | no | `npm run test:pipeline -w server -- imageIngest` |
| Live | manual `workflow_dispatch` only | **yes** | `npm run fuzz:live -w server -- --confirm-spend` |

Quickest way to see it working:

```bash
npm run check:image -w server -- client/src/studio/pipeline/goldenset/photos/hydrangea.jpg
npm run check:image -w server -- 'hello world!!'
```

## Why The Gate Exists

Before this, `/api/pipeline/run-stream` did essentially no validation:

```text
POST /api/pipeline/run-stream
  -> express.json({ limit: '20mb' })
  -> authMiddleware
  -> const { imageBase64 } = req.body     only check: is it truthy?
  -> identifyPlant(imageBase64, ...)
       -> strips the data-URL prefix with a regex
       -> fetch() to Plant.id
```

Nothing looked at the bytes. All decode, resize and format work happened in the
**browser** (`ScanPage.tsx`, capped at a 1024px edge), which is no protection at
all: the browser is the one part of the path an attacker replaces by POSTing to
the endpoint directly.

Consequences, all of which the gate now prevents:

- A truncated, corrupt or non-image payload was forwarded to Plant.id, spending
  a paid call to be told no.
- `Buffer.from(x, 'base64')` never throws. It silently skips characters outside
  the alphabet, so `"hello world!!"` decoded to a short meaningless buffer and
  was sent onward as an image.
- A decompression bomb (small file, enormous declared dimensions) reached the
  decoder untouched.

This also means the fuzz harness had **no target** until the gate existed.
Fuzzing the old route would have reported "all ok" for every mutation, because
there was no code to break. A green run would have asserted nothing.

## What The Gate Does

Two stages, and the order is load-bearing.

**Stage 1, header only.** `sharp().metadata()` parses the header without
decoding pixels, so the pixel ceiling is enforced on the *declared* dimensions.
A bomb is refused on what it claims to be, before anything allocates.

**Stage 2, bounded decode.** A header gate cannot see truncation: a JPEG cut in
half still reports `jpeg 1024x768`. Only an actual decode catches it. This runs
*after* the pixel ceiling, so it can never be the bomb it defends against.

Measured on a 1024x768 upload:

| Step | Cost |
|---|---|
| `metadata()` | 0.15 ms |
| full decode | 2.10 ms |

Two milliseconds against a pipeline that spends seconds in Plant.id, Gemini and
Flux. Worth paying to avoid sending a half-image to a billed API.

### Current policy

| Rule | Value | Constant |
|---|---|---|
| Formats | jpeg, png, webp | `ALLOWED_IMAGE_FORMATS` |
| Minimum edge | 16 px | `MIN_IMAGE_EDGE` |
| Maximum pixels | 40,000,000 | `MAX_IMAGE_PIXELS` |
| Maximum bytes | 15 MB | `MAX_IMAGE_BYTES` |

### Rejection reasons

Each maps to one player-facing sentence. `unreadable` and `truncated` share
wording on purpose ("your upload was cut short" is not something a player can
act on differently), but stay distinct because the logs and the fuzz report
benefit from telling them apart.

```text
missing              no image supplied
not_base64           the string is not well-formed base64
too_large            over the byte cap
too_small            below the minimum edge
unreadable           header will not parse
truncated            header parses, pixel data stops early
unsupported_format   decodes, but not on the allow-list
too_many_pixels      declared dimensions over the ceiling
```

### Three design rules

1. **Reject only what is definitively wrong.** This runs on every scan. A false
   rejection is a player who cannot play, which is worse than forwarding a
   weird-but-decodable photo. Odd aspect ratios, unusual EXIF and large-but-legal
   files all pass.
2. **Never throw.** Callers get a discriminated result. A validator that can
   crash would trade the 500 it prevents for a new one, and would make the
   fuzzer's crash signal ambiguous.
3. **Never return decoder text.** A parser's error message is derived from
   attacker-supplied bytes. It goes to the log, not the response.

## The Fuzzer

### Seed corpus

The ten real plant photographs already in the repo, at
`client/src/studio/pipeline/goldenset/photos/`. No new files to supply. They are
the same images the pipeline is evaluated against and already include deliberate
stress cases (`blurred_plants.jpg`, `lego_plant.jpg`).

Resolution searches, in order: `SPROUT_FUZZ_SEEDS`, a server-local
`server/fuzz-seeds` (what the Docker image ships), then the monorepo golden set
found by walking up from `seedCorpus.ts`.

The walk matters. An earlier version resolved one fixed path,
`__dirname/../../../client/...`, which is correct only from TypeScript source —
`tsc` inserts a `dist` level, so every *compiled* run resolved to
`<repo>/server/client/...` and failed with ENOENT. The container could not have
worked either way: `server/Dockerfile` copies only `client/package.json`, so the
photographs never reached it. They are now copied to `server/fuzz-seeds` at
build time. The golden set stays the single source; the image gets a copy.

### Mutation strategies

Each mutant declares **what the gate should do with it**, rather than the runner
inferring it from the strategy name. This matters, see "A mistake worth knowing
about" below.

| Strategy | Expectation | What it probes |
|---|---|---|
| `bitflip` | either | Flips random bits. May hit the header (reject) or just pixels (accept). Hunts crashes. |
| `truncate` | reject | Cuts the file short. The header still looks valid, so only a real decode catches it. |
| `header_corrupt` | reject | Randomises the first 32 bytes, destroying the format marker. |
| `format_confusion` | depends | Re-encodes to another format. PNG/WebP must be accepted; GIF/TIFF refused. |
| `extreme_resize` | reject | 1x1, 9000x9000, 4000x4. All out of policy. |
| `pixel_noise` | accept | Uniform noise or a flat field. A real photo, so it must pass — judging content is Plant.id's job. |
| `exif_abuse` | accept | Strips EXIF or writes an awkward orientation. Still a valid photo. |
| `not_an_image` | reject | Prose, a script tag, JSON, a fake PDF header. |

`either` is not a cop-out. A bitflip's correct verdict genuinely depends on where
the RNG landed, so asserting one would be asserting a coin toss. Crashes and
hangs are still findings under `either`.

### Outcomes

```text
ok                 answered in time, verdict matched expectation
crash              threw. always a bug: the contract is a result, never an exception
hang               exceeded the time budget. a stall on crafted input is a DoS
silent_bad_output  answered, but wrongly. garbage accepted, or a real photo refused
skipped            the mutation could not be applied to that seed. not a finding
```

`silent_bad_output` is the class the original Python harness could not see, and
the one most likely to be a real defect.

### Determinism

Randomness is injected, never ambient. CI pins the seed, so the same commit
produces the same 300 mutations every run and a red build is reproducible from
its log alone. Live mode leaves it unpinned to explore, but **always prints the
seed it chose**, so any finding can be replayed with `--rng-seed`.

## Running It

### CI mode, free and offline

```bash
# the gate's unit tests plus the fuzzer (~40s)
npm run test:pipeline -w server -- imageIngest --coverage.enabled=false

# watch it tick along rather than staring at a spinner
npm run test:pipeline -w server -- imageIngest --coverage.enabled=false --reporter=verbose

# everything under the pipeline glob
npm run test:pipeline -w server
```

Roughly 40 seconds, because it does about 480 real encode/decode operations.
Where the time goes:

| Test | Time |
|---|---|
| 300 mutations against the gate | 23.7 s |
| detects a validator that accepts everything | 2.2 s |
| detects a validator that refuses everything | 2.2 s |
| reports a throwing sink as a crash | 0.5 s |
| reproduces exactly when replayed | 11.2 s |

`RUNS` at the top of `imageIngest.fuzz.test.ts` is the dial. Dropping 300 to 100
takes it to roughly 15 s at the cost of coverage per run.

### Inspecting one input by hand

```bash
npm run check:image -w server -- ./some-photo.jpg
npm run check:image -w server -- 'data:image/jpeg;base64,AAAA'
npm run check:image -w server                 # prints the current policy
```

Exit code mirrors the verdict (0 accepted, 1 rejected, 2 usage), so it composes
in a shell loop over a directory of samples.

### Live mode, paid

**This spends API credits.** Every run is a full Plant.id -> Gemini/Gemma ->
Flux render. There is no cache in front of Flux (`sprite-storage` dedupes by
species key only *after* generation), so nothing amortises it: 10 runs is 10
full pipelines.

```bash
npm run fuzz:live -w server                                  # refuses, exits 2
npm run fuzz:live -w server -- --confirm-spend --runs 2      # actually runs
npm run fuzz:live -w server -- --confirm-spend --runs 10 --rng-seed 42
```

Live mode detects two things CI cannot:

- **A low-confidence identification that proceeds anyway.** Read from the same
  `MIN_CONFIDENCE_THRESHOLD` the route gates on, so drift between the two shows
  up as a finding rather than hiding.
- **A confident sprite rendered from garbage.** A real image model producing a
  plant from uniform noise. Checked via `RenderResult.fromModel`, since the
  procedural placeholder doing so is correct behaviour.

### From the studio

**Studio -> Fuzz Testing** (`/studio#fuzz`, superadmin only) runs CI-mode
fuzzing in-process and shows the structured report: rng seed, outcome tallies,
per-strategy breakdown, and each finding with the coordinates to reproduce it.
"Replay this seed" fills the seed field from a finished run.

It runs in-process rather than shelling vitest because the report is the point.
Spawning vitest would flatten all of it into "1 passed" plus terminal text.

## Reading A Finding

Every finding carries enough to reproduce it:

```text
[silent_bad_output] seed=melastoma.jpg mutation=truncate iteration=1
    hostile input was accepted: accepted jpeg 768x1024
```

To reproduce: run with that `rngSeed` (printed in the summary) and the same
`runs`. Same seed, same mutations, same verdicts.

Triage by outcome:

- **crash** — always a real bug. The gate's contract is that it never throws.
- **hang** — always a real bug, even without a crash.
- **silent_bad_output** — read the detail line. "hostile input was accepted"
  means the gate is too loose; "a valid image was refused" means too strict, and
  that is a player locked out.

Before assuming the gate is wrong, check the mutant's expectation is right. See
below.

## A Mistake Worth Knowing About

The first run reported **38 findings. All 38 were harness bugs, not gate bugs.**

The runner classified expectations by *strategy name*: `bitflip` and
`format_confusion` were both marked hostile. But a bitflip deep in JPEG pixel
data still yields a perfectly valid image, and `format_confusion` choosing WebP
produces a format genuinely on the allow-list. Both were **correct acceptances
being reported as defects**.

The fix was to have each mutant declare its own expectation at the point it is
built, since only the mutation knows what it actually produced. The lesson
generalises: when a fuzzer reports a finding, confirm the oracle before
confirming the bug.

## Proving The Harness Can Fail

A fuzz suite that always passes is indistinguishable from a broken oracle. Three
committed tests break the sink on purpose and assert the fuzzer notices:

| Test | Asserts |
|---|---|
| accepts everything | `silent_bad_output` raised for every reject-mutant |
| refuses everything | `silent_bad_output` raised for every accept-mutant |
| always throws | all runs recorded as `crash`, nothing escapes |

To convince yourself by hand, comment out the stage-2 decode block in
`imageIngest.ts` and run the fuzz suite. It reports roughly 35
`silent_bad_output`, all `truncate` mutants waved through. Restore it and the
run is green again.

## Implementation Map

```text
server/pipeline/ingest/imageIngest.ts        the gate. the thing being tested
server/pipeline/fuzz/mutations.ts            strategies + seedable PRNG
server/pipeline/fuzz/runner.ts               the loop, sink-agnostic
server/pipeline/fuzz/seedCorpus.ts           loads the golden-set photos
server/pipeline/__tests__/seedCorpus.test.ts        corpus resolution across layouts
server/pipeline/__tests__/imageIngest.test.ts       unit tests for the gate
server/pipeline/__tests__/imageIngest.fuzz.test.ts  CI-mode fuzzing, both legs
server/tests/pipeline-ingest-gate.test.ts    wire-level: do the routes call it?
server/scripts/fuzz-pipeline-live.ts         live mode. NOT a vitest file
server/scripts/check-image.ts                one-input inspector
server/platform/fuzzRunner.ts                in-process runner for the studio
server/platform/adminRoutes.ts               POST /api/platform/run-fuzz
client/src/studio/components/FuzzTests.tsx   the studio page
.github/workflows/tests.yml                  CI job, "Group 10"
.github/workflows/fuzz-live.yml              manual paid run
```

Wiring into the route is one call, deliberately ahead of `createDeadline()` so a
rejection does not charge malformed input against the next real scan's budget:

```ts
const ingest = await validateUploadedImage(imageBase64);
if (!ingest.ok) {
  sendEvent({ event: 'error', step: '1', error: ingest.message, reason: ingest.reason });
  res.end();
  return;
}
```

## Why Live Mode Cannot Be Triggered By Accident

Four independent barriers, because a button that spends money deserves more than
one:

1. It is **not a vitest file** and not under `pipeline/**/__tests__/`. The studio
   Unit Tests page shells `npx vitest run` over that glob, so anything matching
   it is one click from running.
2. It **fails closed**. Without `--confirm-spend` it prints what it would do and
   exits 2.
3. The studio's fuzz runner (`platform/fuzzRunner.ts`) imports **only**
   `validateUploadedImage`. It cannot reach the paid chain.
4. Its workflow has **no `schedule:` and no `push:`** trigger, and sits behind a
   `fuzz-live` GitHub Environment that can carry required reviewers.

Adding an import of the live script to any of the above defeats several of these
at once. Don't.

## Credentials

Nothing is hardcoded. Live mode resolves keys through `server/platform/env.ts`,
exactly as the server does:

| Service | Env var (in precedence order) |
|---|---|
| Plant.id | `PLANT_API_KEY`, `PLANTID_API_KEY` |
| Gemma | `GEMMA_API_KEY`, `NVIDIA_API_KEY` |
| Flux | `FLUX_API_KEY`, `NVIDIA_API_KEY` |
| Gemini | `GEMINI_KEY`, `GEMINI_API_KEY` |

In CI they arrive as GitHub Actions secrets scoped to the `fuzz-live`
environment. `USE_MOCK_APIS` must be `false` there, or the run would fuzz the
mock, bill nothing, and report a success that proved nothing.

## Extending It

**Adding a mutation strategy.** Add it to `MUTATIONS` in `mutations.ts`. It must
return `{ bytes, expect }` or `null` when the seed cannot support it (a file too
small to truncate). Returning `null` rather than throwing matters: a thrown
mutation is not a finding, and letting it look like one poisons the signal.

**Changing the policy.** Edit the constants at the top of `imageIngest.ts`. Then
check the mutation expectations still hold, since some encode the policy: for
example `extreme_resize` expects rejection partly because 9000x9000 is over the
pixel ceiling.

**Changing the run count or seed in CI.** `RUNS` and `RNG_SEED` at the top of
`imageIngest.fuzz.test.ts`. Changing the seed is a commit, which is the point: a
fuzz suite that silently varies makes "it passed yesterday" meaningless.

## The Second Entry Point

`/run-stage2c` is the continuation after the studio's human gate. It receives
`rawSpriteB64` — a sprite this server produced one request earlier — and for a
while it was the only unguarded path left, decoding straight into
`Buffer.from(..., 'base64')` and then sharp.

It is tempting to call that internal traffic. It is not. The pipeline router is
behind `authMiddleware` but **not** `requireSuperAdmin`, so any verified account
can POST arbitrary bytes to it. Only the studio uses it; anyone can reach it.

Two things make this leg different from the scan leg:

- **The declared MIME is wrong, legitimately.** The studio labels the payload
  `data:image/png` even when Flux answered with JPEG. Content sniffing is
  load-bearing here rather than merely tidy: a validator that believed the
  declared type would reject the pipeline's own output.
- **The copy is for an operator.** `IngestAudience` picks the vocabulary. The
  rules do not change, and a test asserts the two legs reach the same verdict
  on identical input, differing only in wording. If they ever diverge, one
  entry point has become a way around the other.

Coverage: both legs are fuzzed with the same 300 mutations, and
`server/tests/pipeline-ingest-gate.test.ts` asserts at the wire that each route
actually calls the guard and stops before any provider is contacted. A unit
test cannot catch a route that forgets to invoke its own gate, which is exactly
the state stage 2c was in.

## Known Gaps

- **Live mode has never been run against real APIs.** Start with `--runs 2`.
- **HEIC is refused.** The allow-list is jpeg/png/webp. If iPhone uploads land
  unconverted, this is the first thing to change.
- **The gate is in every scan's path.** The risk is not a missed attack, it is a
  false rejection locking a real player out. Loosen before tightening.
- **CI adds ~40 s** to the `server-focused` job (20-minute budget, so
  comfortable).

---

# Part 2 — Roadmap

Everything above this line is built, tested and green. Everything below is not
built. It is ordered by dependency: each item unblocks the ones after it, so
build top to bottom rather than picking the interesting-looking one.

## The Thesis

Classical fuzzing, as taught, rests on two assumptions:

1. **Execution is free.** You can afford millions of runs, so coverage-guided
   feedback and genetic search are worth their iteration count.
2. **A crash is the oracle.** You do not need to know the right answer, because
   any answer that is not a segfault or a hang counts as a pass.

An ML image pipeline violates both. Every run is billed, and the characteristic
failure is not a crash but a fluent, confident, wrong answer. That is the whole
reason `silent_bad_output` had to be invented as an outcome class.

This is the claim the work should defend, and the table it produces:

| Technique | Against the text endpoints | Against the image pipeline |
|---|---|---|
| Random testing | works, finds little | dies at the ingest gate — measure this |
| Mutation-based | works | works, and is the only way past the gate |
| Generation-based (EBNF) | works, email has a real grammar | needs reinvention: container grammar *and* scene grammar |
| Coverage-guided feedback | works, coverage is meaningful | meaningless — the logic under test is inside Plant.id |
| Genetic algorithms | affordable | only with a free surrogate fitness function |
| Symbolic execution | works on the validators | does not transfer at all |
| Crash oracle | sufficient | insufficient — needs metamorphic relations |

Producing that table with evidence behind each cell is the deliverable. The
individual harnesses are how the cells get filled in.

## Standing Invariants

These already hold and must keep holding through every item below.

- **Nothing that spends money may match the vitest glob.** Not
  `*.test.ts`, not under `pipeline/**/__tests__/`. Paid harnesses live in
  `server/scripts/` and fail closed without `--confirm-spend`.
- **Randomness stays injected, never ambient.** Every new fuzzer takes an
  `rngSeed` and prints the one it used.
- **Mutants declare their own expectation.** Never infer an expectation from a
  strategy name. See "A Mistake Worth Knowing About" — that bug cost 38 false
  findings once already.
- **The harness calls production code, not a copy of it.** Thresholds, keys and
  argument order come from the same resolvers the routes use.

## Step 0 — Cost Tiers

**Why.** Every item after this one needs to run thousands of iterations, and at
present the only two options are "free but shallow" (the gate) and "expensive
and deep" (the full chain). A tiered sink makes depth a dial instead of a
binary, and makes the funnel measurable.

**Build.** A `FuzzTier` enum and a sink factory that composes the pipeline up to
a given depth:

| Tier | Sink reaches | Cost | Feasible runs |
|---|---|---|---|
| `L0` | `validateUploadedImage` only | free | unlimited |
| `L1` | + local surrogate classifier | free | thousands |
| `L2` | + Plant.id, no render | cheap | hundreds |
| `L3` | + prompt craft + Flux | expensive | tens |

The runner already takes a sink and does not care what is behind it, so this is
additive. `L0` is exactly today's CI sink; `L3` is exactly today's live sink.
The new work is `L1` and `L2`, and the report field recording *which tier a
mutant died at*.

**Files.**

```text
server/pipeline/fuzz/tiers.ts        FuzzTier + makeSink(tier)
server/pipeline/fuzz/runner.ts       add `diedAtTier` to the per-run record
```

**Acceptance.** `formatReport` prints a survival funnel: how many mutants
entered each tier and how many passed it. Existing CI and live runs produce
identical results to before when pinned to `L0` and `L3`.

## Step 1 — The Random-Testing Baseline — BUILT

**Result: 0 of 10,000 random payloads survived the ingest gate (0.00%).**

Two rules stopped them, in roughly even halves — about 5,060 at `not_base64`
and 4,940 at `unreadable`. The split is the real finding: a single rule
catching everything would mean the run measured one thing 10,000 times rather
than covering the gate.

Getting that split honestly took a correction. The first version drew "random
printable" text from the base64 alphabet, so every payload was accidentally
well-formed base64, decoded to garbage and died at `unreadable` — 9,999 hits on
one rule, reported as though the gate had been covered. Printable ASCII
including punctuation is what reaches `not_base64`.

Runs in about 4 seconds. `server/pipeline/fuzz/baseline.ts`, exposed in the
studio as the **Random baseline** suite.

### Original plan

**Why.** The course's claim is that modern input validation rejects random bytes
before they reach anything interesting, which is *the* justification for
mutation-based fuzzing. Right now that claim is asserted in this repo, not
measured. At `L0` it costs nothing to measure.

**Build.** A random-bytes generator (the naive one: uniform bytes, length 0 to
1 MB) and a run mode that fires 10,000 of them at `L0`.

**Acceptance.** A recorded number: how many of 10,000 random payloads survive
the gate. Expected answer is zero or near it. Then the same 10,000 as base64 of
random *printable* text, to show `not_base64` and `unreadable` doing separate
jobs. Record both figures in this document when they exist — they are the
opening slide.

**Cost.** Free. Half a day.

## Step 2 — Findings As Artifacts

**Why.** Replay by `rngSeed` is weaker than it looks. It reproduces the same
mutant *input*, but Plant.id and Flux are non-deterministic and can change
underneath you between runs. So an `L2`/`L3` finding may not reproduce, and its
failure to reproduce does not clear it. At `L0` the seed is enough; past `L0` it
is not.

**Build.** On every finding, write the actual mutant bytes plus the raw
upstream response to a run-scoped directory. Print the path in the finding line.

```text
server/pipeline/fuzz/artifacts.ts    writeFinding(runId, finding, bytes, raw)
.gitignore                           the artifact directory
```

**Acceptance.** A finding line carries a file path; `check:image` accepts that
path directly and reproduces the verdict. Artifacts are never committed and
never contain credentials.

## Step 3 — Record-Replay Cassettes

**Why.** With Step 2 capturing real upstream responses, those responses become
reusable. A cassette turns the orchestration code — the drift check, the
`fromModel` logic, the deadline handling — into something fuzzable for free and
deterministically, which is the only way to iterate on it.

**Build.** A cassette-backed implementation of the Plant.id and Flux calls,
keyed by a hash of the input bytes. Three modes: `record` (live, writes),
`replay` (offline, throws on a miss), `passthrough` (today's behaviour).

**Acceptance.** A cassette-mode fuzz run over recorded responses produces
byte-identical reports on repeat, and spends nothing. It must be impossible for
a cassette run to reach the network — assert it, do not assume it.

**Note.** Cassettes are *not* mocks in the `USE_MOCK_APIS` sense. They are real
responses replayed. Keep them distinct, and never let a cassette run report as
if it were a live run — that is the same failure mode as fuzzing the mock.

## Step 4 — Metamorphic Relations

**This is the highest-value item in the roadmap.** Everything before it is
plumbing to make it affordable.

**Why.** The only content oracle today is "the mutation was `pixel_noise`, so
any confident answer is wrong" — which works solely because the answer was
hardcoded. Metamorphic testing removes that dependency: instead of asking *is
this output correct*, it asserts *relations between the outputs of related
inputs*. No ground truth needed, which is precisely the problem with testing a
model whose job is to know things you do not.

**Build two families.**

**4a. Invariance relations.** Transform an input in a way that cannot change
what the plant is, and assert the identification does not change:

| Transform | Relation |
|---|---|
| rotate 90/180/270 | species unchanged |
| horizontal flip | species unchanged |
| crop 5% from each edge | species unchanged |
| re-encode JPEG q95 | species unchanged |
| resize to 80% | species unchanged |

A different species for a flipped photo is a finding, and it was found without
knowing what the plant was. Allow a configurable confidence tolerance; the
*species label* is the assertion, not the exact probability.

**4b. Monotonicity relations.** Interpolate a real photo toward uniform noise in
ten steps and assert two things:

- confidence decreases monotonically (allow a small epsilon for model jitter);
- confidence crosses below `minConfidenceThreshold` **before** the image stops
  being recognisable to a human.

A confidence that stays above the floor at 90% noise is the strongest possible
version of the finding the live sink currently gets by hardcoding.

**Files.**

```text
server/pipeline/fuzz/metamorphic.ts           relations + transforms
server/scripts/fuzz-metamorphic-live.ts       paid runner. NOT a vitest file
server/pipeline/__tests__/metamorphic.test.ts relations tested against cassettes
```

**Acceptance.** The noise sweep produces a confidence-vs-noise curve per seed,
emitted as JSON, with the threshold as a horizontal line and the crossing point
recorded. Ten API calls per seed at `L2`. This is the headline result — make the
output plottable, not just printable.

## Step 5 — Generation-Based Fuzzing

**Why.** Mutation starts from real photos and can only ever wander outward from
them. Generation reaches inputs mutation cannot construct at all. The course
teaches this over an expression grammar; the interesting move is that images
admit **two different grammars at two different levels**, and saying so is most
of the novelty claim.

**5a. Container grammar (targets the decoder and the gate).**

JPEG is a byte grammar. Write it as EBNF and generate structurally valid but
unusual files:

```text
JPEG    ::= SOI Segment+ SOS ScanData EOI
Segment ::= APPn | DQT | SOF0 | DHT | COM | DRI
SOF0    ::= marker length precision height width components
```

Then generate: segments out of order, duplicate `DQT`, `SOF0` declaring zero
height, missing `EOI`, `COM` of absurd length. Apply the course's expansion
limits so recursion terminates. This is the literal instantiation of the
lecture, and it targets `sharp` and the two-stage gate directly.

**5b. Scene grammar (targets the model).**

More interesting, and the part with no established literature to lean on. A
grammar that synthesises *images* rather than bytes:

```text
Scene    ::= Background Object+
Background ::= solid(Colour) | gradient(Colour, Colour) | noise(density)
Object   ::= Shape Colour Size Position
Shape    ::= leaf | stem | lobed_blob | serrated_blob | circle | rect
Colour   ::= green_range | brown_range | random_rgb
```

Render with `sharp` compositing or node-canvas. This produces **plant-like
non-plants** — the input class where a confident identification is most
damning, and one that mutating real photographs can never reach. Object count
and nesting depth are the expansion limits.

**Files.**

```text
server/pipeline/fuzz/grammar/jpegGrammar.ts    container-level EBNF + generator
server/pipeline/fuzz/grammar/sceneGrammar.ts   scene EBNF + renderer
server/pipeline/fuzz/grammar/expand.ts         shared bounded expansion
```

**Acceptance.** Container grammar: 1,000 generated files at `L0`, no crashes, and
a per-rule breakdown of which productions the gate refuses. Scene grammar: 50
generated scenes at `L2`, reporting how many drew a confident species. Both
seeded and reproducible. Save a grid of generated scenes as a PNG — it is the
most legible slide in the deck.

## Step 6 — Genetic Search With A Surrogate

**Why.** GA needs many generations and the pipeline costs money per evaluation,
so the textbook form is unaffordable. The standard escape is a **surrogate
fitness function**: evolve against a free local model, then spend real money
only on the elite few.

**Build.**

- **Population** — candidate images, seeded from Step 5b scenes.
- **Fitness** — a local classifier's confidence that a provable non-plant is a
  plant. Maximise it. Any small local vision model with a plant-ish head is
  fine; it does not need to be good, it needs to be free and correlated.
- **Crossover** — patch splice. Take rectangular regions of parent A and paste
  them into parent B. The course describes crossover at byte offsets; the 2D
  generalisation is the interesting bit and is worth stating explicitly.
- **Mutation** — pixel perturbation at a random position, exactly as taught.
- **Termination** — max generations, or fitness plateau below a delta.

Then promote the top 5 individuals to `L2` and check whether they fool the real
Plant.id.

**Files.**

```text
server/pipeline/fuzz/surrogate.ts   local classifier wrapper, free
server/pipeline/fuzz/genetic.ts     population, fitness, crossover, mutation
server/scripts/fuzz-genetic.ts      L1 loop free; promotion to L2 gated
```

**Acceptance.** A fitness-over-generations curve, plus the transfer rate: of the
elite promoted to Plant.id, how many kept their confidence. **If an image evolved
against a free surrogate transfers to the paid model, that is the strongest
result available from this whole roadmap** — cross-model transfer is a real and
well-documented phenomenon and it makes the surrogate trick sound rather than
merely thrifty.

## Step 7 — EXIF As A Trust Boundary

**Why.** This is the bridge between the image work and the text work, and it
stops the two halves reading as unrelated projects. Image files carry text
metadata. If any of it reaches storage or the UI, an image is a delivery vehicle
for exactly the injection payloads from the code-standards material — and the
boundary is not where anyone expects it to be.

Note the current mutation table treats `exif_abuse` as `accept`, which is
correct *for the gate*. The question here is different: what happens downstream.

**Build.** EXIF fields (`ImageDescription`, `Artist`, `UserComment`,
`Software`) carrying:

- a `<script>` tag,
- an SQL fragment,
- the same payloads in `\uFE64`/`\uFE65` fullwidth form, to test whether
  anything normalises **before** validating rather than after,
- a `COM` segment of several megabytes.

**Also here: decompression bombs.** The gate handles the declared-dimensions
case at Stage 1. Add the compression-ratio case — a small PNG that expands to
gigabytes — and assert the pixel ceiling catches it on declared size before
allocation.

**Acceptance.** A trace of where each EXIF field ends up: dropped at the gate,
stored, or rendered. Any field that reaches a template unescaped is a real
finding and should be written up as one.

## Step 8 — The Dedupe Race

**Why.** This document already states the bug's precondition, in "Live mode,
paid": sprite-storage dedupes by species key *only after* generation. Two
concurrent scans of the same species therefore both generate, and both write.
That is the concurrency material instantiated on a defect this system plausibly
has right now.

**Build.** A test firing concurrent uploads of the same species through
`Promise.all`, with the generator mocked so it costs nothing and counts its
invocations.

**Acceptance.** The test demonstrates either double generation or a write race,
and fails before the fix and passes after. If the fix is a transaction or an
advisory lock on the species key, say which and why in the commit.

---

# Part 3 — Text Fuzzing — BUILT

**Result: 93 cases, 0 findings, slowest validation 1 ms** (against a 250 ms
ReDoS bound). Runs in under 10 ms — it is Joi calls, nothing else.

Built as `server/pipeline/fuzz/text/`, exposed in the studio as the **Text
validators** suite. It drives the real `querySchema` and `statusSchema` from
`routes/query.routes.ts`, not copies.

Two results worth stating plainly, both negative:

- **ReDoS: not vulnerable.** Joi's email validator does not backtrack —
  measured at about 1 ms on nested-quantifier shapes, a 5,000-character local
  part, and 500 repeated separators. "We looked and it is safe" is a finding,
  and the time bound is asserted so nobody has to look again.
- **Injection payloads are ACCEPTED, deliberately.** A contact form that
  refuses an angle bracket is broken: someone reporting a scanner bug may need
  to paste markup. Safety here is escaping on output, not refusal on input, and
  the tests assert acceptance so nobody "fixes" it in the wrong direction.

Not yet built from this part: coverage-guided feedback, and symbolic execution.
See the note at the end of this section on why the latter is limited here.

### Original plan

A second harness against the text entry points. Deliberately kept separate from
the image work, because its value in the presentation is as the **control
group**: it is the domain where both classical assumptions hold, so it is where
the techniques that do not transfer to images can be shown working properly.

## Targets

**Contact form.**

| Field | Constraint |
|---|---|
| name | required |
| email | required, format-validated |
| organisation | optional |
| inquiry type | enumerated |
| subject | required |
| message | required, max 2000 characters |

**Ticket manager.**

| Field | Constraint |
|---|---|
| feedback number | numeric identifier |
| email | format-validated |

## What Belongs Here Rather Than In Part 2

**Coverage-guided feedback.** Free, deterministic, and coverage is actually
meaningful because the logic under test is code in this repo rather than a
remote model. Emit a JSON coverage report per generation and feed it back as
fitness. This is the honest home for the feedback loop — do not fake one on the
image side.

**EBNF done properly.** Email has a real grammar. Generate valid, near-valid and
invalid addresses from it, and show the parse trees. Quoted local parts, IP
literals, plus-addressing, consecutive dots, trailing dot, IDN. This is where
the grammar material gets its full treatment, with a grammar nobody has to be
convinced exists.

**Boundary values.** Message at 1999 / 2000 / 2001 characters. Feedback number
as negative, zero, float, scientific notation, `2^31`, `2^53`, leading zeros,
and — separately — a valid ID belonging to someone else. That last one is an
authorisation test wearing a fuzzing costume, and it is usually the one that
finds something.

**Injection and normalisation.** SQL, XML and XSS payloads into name, subject
and message, each in plain form *and* in a Unicode form that only becomes
dangerous after `NFKC`. The pairing is the point: it tests whether the system
normalises before validating or after, which is the difference between a filter
and a decoration.

**ReDoS.** If email validation uses a backtracking regex, test it with the
nested-quantifier pattern. Assert a time bound, not just a verdict — a validator
that eventually returns the right answer after eight seconds has already failed.

**Symbolic execution.** The validators are small, pure and total, which makes
them genuinely tractable: solve the path constraints to derive boundary inputs
rather than searching for them. State plainly in the write-up that this is the
technique's ceiling — you can symbolically execute a length check, and you
cannot symbolically execute a diffusion model. Naming where a technique stops
working is a stronger result than pretending it applies everywhere.

**Files.**

```text
server/pipeline/fuzz/text/mutations.ts       text mutation strategies
server/pipeline/fuzz/text/emailGrammar.ts    RFC-derived EBNF + generator
server/pipeline/fuzz/text/payloads.ts        injection corpus, plain + fullwidth
server/pipeline/fuzz/text/coverage.ts        JSON coverage -> fitness
server/pipeline/__tests__/textFuzz.test.ts   CI mode, free, pinned seed
```

**Acceptance.** Runs in CI in under 20 seconds. Same standing invariants as the
image harness: seeded, mutants declare expectations, sink is production code.
The same three "prove the harness can fail" tests, adapted.

---

# Part 4 — The Presentation

Image fuzzing is thin in the literature, so the framing that earns the talk is
the *comparison*, not either harness alone. Suggested arc:

1. **The funnel.** 10,000 random payloads, zero survivors past the gate. The
   course's claim, measured here. Establishes why mutation-based is not a
   preference but a necessity.
2. **Mutation-based, and the 38 false findings.** The oracle-before-bug lesson.
   Audiences remember the mistake more than the method.
3. **The oracle problem.** A crash oracle passes a pipeline that renders a
   confident fern from static. Introduce `silent_bad_output`.
4. **Metamorphic relations.** How to test a model without ground truth. Land the
   confidence-vs-noise curve here — it is the headline.
5. **Generation-based, twice.** Container grammar for the decoder, scene grammar
   for the model. Show the grid of generated scenes.
6. **GA with a surrogate.** The cost problem and the transfer result.
7. **Where the techniques stop.** The two-assumption table from the top of Part
   2, now with evidence in every cell. This is the contribution.

**Related work to have in hand.** Metamorphic testing (Chen et al., 1998, and
its ML applications); DeepXplore and neuron coverage; DeepTest; TensorFuzz; and
the long history of AFL against libjpeg and libpng for the container-level side.
Verify publication details before citing — that list is from memory and the ML
testing literature moves quickly.

**What to be honest about in the talk.** Live mode has still never been run
against real APIs. Non-determinism means an `L2`/`L3` finding may not reproduce.
Surrogate transfer may simply not happen. A negative result, stated clearly, is
a better talk than an overstated positive one.

---

# Related

- [DEPLOYMENT.md](DEPLOYMENT.md) — how CI and the deployments fit together
- [AGENT_HOOKS.md](AGENT_HOOKS.md) — the pre-commit checks that run alongside
- [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md) — client/server API contract
