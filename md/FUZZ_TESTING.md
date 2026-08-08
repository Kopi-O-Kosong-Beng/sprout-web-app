# Fuzz Testing

## How To Read This

| Part | Status | What it covers |
|---|---|---|
| **Part 0** | — | Fuzzing from scratch. Read this first if the vocabulary is new. |
| **Part 1** | built, green | The image ingest gate and the mutation fuzzer that tests it. |
| **Part 2** | built, green | The random-testing baseline. One number, and why it matters. |
| **Part 3** | built, green | The text validators. The control group. |
| **Part 4** | **not built** | Roadmap, in dependency order, with acceptance criteria. |
| **Part 5** | — | How to present the whole thing. |

Parts 1-3 describe code that exists, runs on every push (mostly — see
[Known Gaps](#known-gaps)), and is green. Part 4 is written as implementation
instructions. **Nothing in Part 4 exists yet; do not document it as if it does.**

Three suites are built. All three are free, offline, and cannot reach a paid
provider:

| Suite | Target | Size | Time |
|---|---|---|---|
| **Mutation** | the image ingest gate, fed mutated real photos | 300 mutants × 2 entry points | ~7 s per leg |
| **Random baseline** | the same gate, fed pure noise | 10,000 payloads | ~4 s |
| **Text validators** | the contact and ticket Joi schemas | 93 cases | under 10 ms |

A fourth mode, **live**, spends real money and is covered in Part 1.

---

# Part 0 — Fuzzing In Five Minutes

Skip this if you already know what a seed corpus and an oracle are.

## The idea

Ordinary tests check inputs a human thought of. Fuzzing checks inputs nobody
thought of: you generate a very large number of weird inputs automatically, feed
them to the code, and watch for something going wrong.

The classic result is that this finds bugs hand-written tests miss, because a
human writing tests unconsciously writes *reasonable* inputs, and the bugs live
where the input is unreasonable.

## The five moving parts

Every fuzzer, including this one, is built from the same five pieces. Knowing
their names makes the rest of this document readable.

```text
seed corpus  ->  mutation  ->  [ mutant ]  ->  sink  ->  oracle  ->  outcome
   real            how you       the weird      the code    how you      what the
   inputs          break them    input          under test  decide if    runner
   you start                                                the answer   records
   from                                                     was right
```

| Term | In this repo |
|---|---|
| **Seed corpus** | Ten real plant photographs from the studio's golden set. |
| **Mutation** | One of eight ways to damage a photo: flip bits, cut it short, corrupt its header, re-encode it, resize it absurdly, replace it with noise, mangle its EXIF, or replace it with prose. |
| **Mutant** | The damaged bytes that come out, plus a note saying what the gate *should* do with them. |
| **Sink** | The function under test. In CI that is `validateUploadedImage` — literally the function a player's scan hits, not a copy. |
| **Oracle** | The rule that decides whether the sink's answer was right. Here: compare the answer to the expectation the mutant carries. |
| **Runner** | The loop that picks a seed, picks a mutation, calls the sink, consults the oracle, records an outcome. `fuzz/runner.ts`. |

## Why the oracle is the hard part

The textbook oracle is "did it crash?" That is free — you do not need to know the
right answer, because any answer that is not a segfault counts as a pass.

That oracle is useless against a machine-learning pipeline. The characteristic
failure of an image model is not a crash. It is a **fluent, confident, wrong
answer**: it renders a beautiful fern from a photograph of television static and
reports 94% confidence. Nothing crashed. Everything is broken.

That is why this harness has an outcome class the textbook version does not:

```text
silent_bad_output   the sink answered, in time, without throwing —
                    and the answer was wrong
```

Catching that class requires each mutant to *declare what should happen to it*,
which is the single most important design decision in this whole harness. It is
also the one that took a bug to learn; see
[A Mistake Worth Knowing About](#a-mistake-worth-knowing-about).

## Why randomness has to be seeded

A fuzzer picks inputs at random. If that randomness comes from `Math.random()`,
a failure is unreproducible: CI goes red, you run it again, it goes green, and
you have learned nothing.

So randomness is **injected, never ambient**. Every mutation function takes an
`rng` argument. The runner builds that `rng` from a single integer — the *rng
seed* — using a small deterministic generator (mulberry32, in `mutations.ts`).

The consequence is the whole point:

- Same seed → same 300 mutations → same verdicts, on any machine, forever.
- CI pins the seed to `42`, so a red build is reproducible from its log alone.
- Live mode leaves it unpinned to explore new ground, but **always prints the
  seed it chose**, so any finding can be replayed with `--rng-seed`.

## Vocabulary used throughout

| Word | Meaning here |
|---|---|
| **gate** | `validateUploadedImage` — the function that decides whether uploaded bytes are an acceptable image |
| **leg** / **entry point** | one of the two routes that accept image bytes |
| **finding** | a recorded failure: a crash, a hang, or a wrong verdict |
| **skipped** | the mutation could not be applied to that seed (a 20-byte file cannot be truncated). Not a finding, but tracked, because a run that is mostly skips is not testing anything |
| **L0 / L1 / L2 / L3** | cost tiers — how deep into the paid pipeline a run reaches. Only L0 (free) and L3 (full price) exist today; see [Part 4, Step 0](#step-0--cost-tiers) |

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
`client/src/studio/pipeline/goldenset/photos/`:

```text
angelina_stonecrop   blue_princess_holly   blurred_plants      crown_imperial
hydrangea            lego_plant            melastoma           mimosa_tree
purple_fountain_grass                      vanda_miss_joaquim
```

No new files to supply. They are the same images the pipeline is evaluated
against and already include deliberate stress cases (`blurred_plants.jpg`,
`lego_plant.jpg` — both marked `stress: true` in the golden-set manifest).

They are loaded **sorted by filename**, not in `readdir` order, because
filesystem order varies by machine and would quietly break the reproducibility
everything else rests on.

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

### How a mutant reaches the gate

Easy to get wrong, and it *was* wrong for a while. It is worth a section because
it is a general lesson about fuzzer fidelity.

The route always receives `req.body.imageBase64` as a **string**. So production
always takes the validator's string branch:

```text
string in  ->  strip the data-URL prefix
           ->  is this well-formed base64?      <- the not_base64 rule
           ->  decode
           ->  header check, then bounded decode
```

The original fuzzer handed raw `Buffer`s straight to `validateUploadedImage`.
That takes the *other* branch and skips the base64 check entirely — so the
harness was exercising a path production never uses, and the `not_base64` rule
was **unreachable from any fuzz run**. The suite was green about code nobody
runs.

Delivery is now declared by each mutant, and one shared sink
(`fuzz/imageSink.ts`) is used by CI, the studio page, the baseline and the live
runner, so they cannot drift apart:

| `deliverAs` | What the sink sends | Why |
|---|---|---|
| `base64` (default) | `data:image/jpeg;base64,<bytes>` | what a real client does with whatever bytes it holds |
| `literal` | the bytes as UTF-8 text, unencoded | prose arriving in a field that should hold base64 — the attacker case, and the only way to reach `not_base64` |

Never inferred from the strategy name. Declared, like the expectation.

### Mutation strategies

Each mutant declares **what the gate should do with it**, rather than the runner
inferring it from the strategy name. This matters, see "A mistake worth knowing
about" below.

| Strategy | Expectation | What it probes |
|---|---|---|
| `bitflip` | either | Flips 1..n random bits. May hit the header (reject) or just pixel data (accept). Hunts crashes. |
| `truncate` | reject | Cuts the file short at a random point. The header still looks valid, so only a real decode catches it. |
| `header_corrupt` | reject | Randomises the first 32 bytes, destroying the format marker. |
| `format_confusion` | depends | Re-encodes to PNG, WebP, GIF or TIFF. PNG/WebP must be accepted; GIF/TIFF refused. |
| `extreme_resize` | reject | 1x1, 4000x4, 4x4000, and a forged 8000x8000 header. All out of policy. |
| `pixel_noise` | accept | Uniform noise, or a flat black/white field, at the seed's own dimensions. A real decodable JPEG, so it must pass — judging content is Plant.id's job. |
| `exif_abuse` | accept | Strips EXIF, or writes orientation 5-8 (the mirrored/rotated cases). Still a valid photo. |
| `not_an_image` | reject | Prose, a script tag, JSON, a fake PDF header, a path traversal string, 10,000 `a`s. Delivered `literal`. |

`either` is not a cop-out. A bitflip's correct verdict genuinely depends on where
the RNG landed, so asserting one would be asserting a coin toss. Crashes and
hangs are still findings under `either`.

Two of these carry a lesson in the code comments, both from real mistakes:

- **`exif_abuse` used to write out-of-range orientations (9-255)** to be nastier.
  `sharp` refuses to *encode* those, so the mutation threw and every second
  `exif_abuse` run was recorded as `skipped`. Fifteen wasted iterations that
  looked like coverage. Orientations 5-8 are valid EXIF and are the ones a naive
  decoder actually mishandles, because they swap width and height.
- **`extreme_resize` used to allocate a gigabyte.** Next section.

### The gigabyte that was never needed

`extreme_resize` originally tested the pixel ceiling by genuinely rasterising a
9000x9000 PNG — 81 megapixels of real pixels — and handing it to the gate.

Memory measured per strategy, 25 iterations each:

| Strategy | RSS delta | Strategy | RSS delta |
|---|---|---|---|
| `truncate` | 0 MB | `pixel_noise` | −108 MB |
| `header_corrupt` | 2 MB | `exif_abuse` | 2 MB |
| `format_confusion` | 35 MB | `not_an_image` | 0 MB |
| **`extreme_resize`** | **+1008 MB** | | |

A 300-mutation run peaked between 1.2 GB and 2.6 GB. That is not academic: the
studio's Fuzzy Testing page runs this **in-process on the backend**, and
`render.yaml` puts the backend on the free plan — 512 MB. Pressing Run on the
deployed studio would have OOM-killed the container.

The raster was never needed, and this is the interesting part. **A decompression
bomb IS a small file claiming to be huge.** The gate reads *declared* dimensions
from the header and rejects before decoding, so the honest way to test that rule
is to forge a header:

```text
take an 8x8 PNG                         289 bytes
patch width and height in the IHDR      -> 8000 x 8000 = 64 megapixels
recompute the IHDR chunk CRC            <- required, or sharp calls the
                                           file corrupt and the mutant
                                           tests error handling instead
```

289 bytes instead of a gigabyte, and a *better* test.

8000x8000 is chosen deliberately: over our 40 MP ceiling, and under `sharp`'s own
~268 MP default. Above that, `sharp` throws while parsing the header and the
mutant lands on `unreadable` — still a rejection, but no longer exercising the
`too_many_pixels` rule this case exists for. Verified it now reports
`too_many_pixels`.

Result: peak RSS for 600 mutations fell from 2614 MB to 322 MB, inside the
512 MB budget.

On the wider "does the fuzzer leak?" question, measured rather than assumed:
JavaScript heap is **flat at 16 MB across 2,000 mutations**, so nothing is
retained on our side. `sharp` decoding 1,200 times holds steady at ~183 MB, so
the decoder is not leaking either. RSS drifts about 50 MB over 1,600 mutations,
which is the native allocator keeping freed pages rather than returning them —
bounded in practice by the single-flight guard and the 10,000-run cap.

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

The runner also records `accepted` separately from `outcome`. They are not the
same thing: an acceptance can be perfectly correct. The random baseline in Part 2
needs the raw count of what *survived*, not the count of what was *wrong*.

### Determinism

Randomness is injected, never ambient. CI pins the seed, so the same commit
produces the same 300 mutations every run and a red build is reproducible from
its log alone. Live mode leaves it unpinned to explore, but **always prints the
seed it chose**, so any finding can be replayed with `--rng-seed`.

## Running It

### CI mode, free and offline

```bash
# the gate's unit tests plus the fuzzer
npm run test:pipeline -w server -- imageIngest --coverage.enabled=false

# watch it tick along rather than staring at a spinner
npm run test:pipeline -w server -- imageIngest --coverage.enabled=false --reporter=verbose

# the fuzz suites only
npm run test:pipeline -w server -- imageIngest.fuzz baseline textFuzz --coverage.enabled=false

# everything under the pipeline glob
npm run test:pipeline -w server
```

Roughly 23 seconds locally for the `imageIngest` pair (32 tests), because the
fuzz file builds and validates about 900 mutants. Where the time goes:

| Test | Mutants | Time |
|---|---|---|
| 300 mutations against the gate (photo leg) | 300 | 7.0 s |
| the same 300 on the sprite leg | 300 | 7.0 s |
| both legs reach the same verdict | 120 | 2.5 s |
| reproduces exactly when replayed | 50 | 4.8 s |
| detects a validator that accepts everything | 60 | 0.76 s |
| detects a validator that refuses everything | 60 | 0.76 s |
| reports a throwing sink as a crash | 10 | 0.49 s |

About 23 ms per mutation, dominated by real encode/decode work in `sharp`. CI
runners are slower than a laptop; budget accordingly.

`RUNS` at the top of `imageIngest.fuzz.test.ts` is the dial, and cost scales
linearly: 300 → 7 s, 100 → ~2.3 s, at the cost of coverage per run.

> This was ~40 s before the `extreme_resize` fix described above. Not rasterising
> 81 megapixels 40-odd times per run turned out to be most of the runtime as
> well as most of the memory.

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

**Studio -> Fuzzy Testing** (`/studio#fuzz`, superadmin only) runs all three free
suites in-process and shows the structured report for whichever is selected:

| Suite | Default size | Report |
|---|---|---|
| Mutation | 300 runs | rng seed, outcome tallies, per-strategy breakdown, findings with replay coordinates |
| Random baseline | 10,000 payloads | survivor count, survival rate, funnel bars per rejection reason |
| Text validators | fixed 93 cases | per-technique tallies, slowest validation against the ReDoS bound |

Run counts are clamped to 10..10,000, and a single-flight guard means one run at
a time across all suites — the image work is CPU-bound decoding, so two
concurrent runs would just make both slow. Switching suites clears the previous
report rather than leaving a mismatched one under a new heading. "Replay this
seed" fills the seed field from a finished run.

It runs in-process rather than shelling vitest because the report is the point.
Spawning vitest would flatten all of it into "1 passed" plus terminal text.

Served by `POST /api/platform/run-fuzz`, which returns 409 while a run is in
flight.

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

A fourth asserts the reproducibility guarantee itself: two runs with the same
seed produce identical `(seed, mutation, outcome)` triples. If that ever fails, a
red build stops being reproducible from its log and the suite loses most of its
value.

To convince yourself by hand, comment out the stage-2 decode block in
`imageIngest.ts` and run the fuzz suite. It reports roughly 35
`silent_bad_output`, all `truncate` mutants waved through. Restore it and the
run is green again.

## Implementation Map

```text
--- the thing being tested -------------------------------------------------
server/pipeline/ingest/imageIngest.ts        the gate

--- the harness ------------------------------------------------------------
server/pipeline/fuzz/runner.ts               the loop, sink-agnostic
server/pipeline/fuzz/mutations.ts            8 strategies + baseline pair + PRNG
server/pipeline/fuzz/imageSink.ts            shared sink: delivers like the route
server/pipeline/fuzz/seedCorpus.ts           loads the golden-set photos
server/pipeline/fuzz/baseline.ts             random-testing baseline (Part 2)
server/pipeline/fuzz/text/payloads.ts        text corpus (Part 3)
server/pipeline/fuzz/text/textFuzz.ts        text harness (Part 3)

--- the tests --------------------------------------------------------------
server/pipeline/__tests__/imageIngest.test.ts       unit tests for the gate
server/pipeline/__tests__/imageIngest.fuzz.test.ts  CI-mode fuzzing, both legs
server/pipeline/__tests__/seedCorpus.test.ts        corpus resolution across layouts
server/pipeline/__tests__/baseline.test.ts          the baseline, 2,000 runs
server/pipeline/__tests__/textFuzz.test.ts          the text validators
server/tests/pipeline-ingest-gate.test.ts           wire-level: do the routes call it?

--- the entry points -------------------------------------------------------
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
   `validateUploadedImage` (for the two image suites) and the Joi schemas (for
   the text suite). It cannot reach the paid chain.
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
return `{ bytes, expect, deliverAs? }` or `null` when the seed cannot support it
(a file too small to truncate). Returning `null` rather than throwing matters: a
thrown mutation is not a finding, and letting it look like one poisons the
signal. Then add a one-line description to `MUTATIONS` in `FuzzTests.tsx`, or the
studio's strategy table shows a bare name.

**Watch the memory.** New strategies run in-process on a 512 MB instance. Measure
RSS over 25 iterations before committing one; see "The gigabyte that was never
needed" for what going wrong looks like.

**Changing the policy.** Edit the constants at the top of `imageIngest.ts`. Then
check the mutation expectations still hold, since some encode the policy: for
example `extreme_resize` expects rejection partly because its forged 8000x8000
header is over the pixel ceiling, and partly because 1x1 is under the minimum
edge.

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

- **The baseline and text suites are not in CI.** Group 10 in
  `.github/workflows/tests.yml` runs `imageIngest.test.ts` and
  `imageIngest.fuzz.test.ts` only. `baseline.test.ts` and `textFuzz.test.ts` run
  locally, from the studio, and under the full `npm run test:pipeline` glob — but
  no CI job invokes them, so a regression in either would not turn a build red.
  They cost about 1.7 s and 6 ms respectively; adding them to Group 10 is two
  lines.
- **Live mode has never been run against real APIs.** Start with `--runs 2`.
- **HEIC is refused.** The allow-list is jpeg/png/webp. If iPhone uploads land
  unconverted, this is the first thing to change.
- **The gate is in every scan's path.** The risk is not a missed attack, it is a
  false rejection locking a real player out. Loosen before tightening.
- **CI adds ~25 s** to the `server-focused` job (20-minute budget, so
  comfortable).

---

# Part 2 — The Random Baseline

**Built. Result: 0 of 10,000 random payloads survived the ingest gate (0.00%).**

## What it is measuring

Classical fuzzing starts with "throw random bytes at it". Everything in Part 1
rests on the claim that this does not work here — that modern input validation
rejects random input long before it reaches anything worth testing, and therefore
that mutation-based fuzzing is a **necessity, not a stylistic preference**.

Until this suite existed, that claim was asserted in this document and never
measured. At L0 measuring it is free, so it should be measured.

## The result

Running 10,000 random payloads against the real gate, rng seed 1, in 4.1 seconds:

```text
=== Random-testing baseline ===
  10000 random payloads, 0 survived (0.00%)
  rng seed: 1
  stopped by:
    not_base64: 5060
    unreadable: 4940
```

**The split is the real finding, not the zero.** A single rule catching all
10,000 would mean the run measured one thing 10,000 times rather than covering
the gate. Two rules carrying roughly equal traffic is evidence that the funnel
has more than one stage doing work.

## Two generators, and why both are needed

The baseline uses two strategies, deliberately kept out of `MUTATIONS` so a
normal mutation run is not diluted by inputs that stop being interesting once the
claim has been measured:

| Strategy | Produces | Dies at |
|---|---|---|
| `random_bytes` | uniform random bytes, 0 to 64 kB, delivered as base64 | `unreadable` — it *is* valid base64 once encoded, so it decodes to garbage and fails the header parse |
| `random_printable` | random printable ASCII, 16 to 32,768 chars, delivered `literal` | `not_base64` — spaces and punctuation are outside the base64 alphabet |

## The correction that made the number honest

The first version drew "random printable" text **from the base64 alphabet**. Every
payload was therefore accidentally well-formed base64, decoded to garbage, and
died at `unreadable`:

```text
before the fix:   unreadable: 9999    not_base64: 1
after the fix:    not_base64: 5060    unreadable: 4940
```

Same zero survivors either way. Same green suite. But the first version measured
one rule 9,999 times while reporting as though it had covered the gate — an
example of a fuzz run that looks like coverage and is not. Including punctuation
in the alphabet is the entire fix.

## Running it

```bash
# in CI/local test form — 2,000 runs, same result, a quarter of the time
npm run test:pipeline -w server -- baseline --coverage.enabled=false
```

Or **Studio -> Fuzzy Testing -> Random baseline**, which defaults to the full
10,000 and draws the funnel as bars.

`baseline.test.ts` uses 2,000 runs rather than 10,000: identical conclusion, a
quarter of the time. The 10,000 figure is the one quoted here and the one the
studio page defaults to.

## What the tests assert

| Test | Asserts |
|---|---|
| rejects every random payload | `survivors === 0`, no crashes, no hangs |
| exercises two distinct rules | both `not_base64` and `unreadable` carry >10% of traffic — the anti-regression for the correction above |
| reproduces when replayed | same seed → identical funnel |
| would notice a leaky gate | against a sink that accepts everything, all 50 payloads are reported as survivors *and* as findings |

That last one is the teeth check. A reported zero only means something if a
non-zero is reachable.

---

# Part 3 — The Text Validators

**Built. Result: 93 cases, 0 findings, slowest validation 1 ms** (against a
250 ms ReDoS bound). The whole suite runs in under 10 ms — it is Joi calls,
nothing else.

## Why this exists alongside the image work

It is the **control group**.

Both classical fuzzing assumptions hold on the text endpoints: execution is free,
and a wrong answer is decidable by looking at it. So this is the right place to
demonstrate the techniques that do *not* transfer to an ML image pipeline,
working properly on something that suits them. Without it, "coverage-guided
feedback is meaningless here" is an excuse; with it, it is a comparison.

## What it drives

The **real** `querySchema` and `statusSchema`, exported from
`routes/query.routes.ts` — the same objects the routes validate against, not
copies. A harness fuzzing a reimplementation would prove nothing about what the
endpoints accept.

**Contact form** (`POST /api/query/submit`):

| Field | Constraint |
|---|---|
| `name` | required, trimmed, 1-100 |
| `email` | required, trimmed, `.email()` |
| `organisation` | optional, ≤120, `''` allowed |
| `subject` | required, trimmed, 1-150 |
| `category` | required, one of `TICKET_CATEGORIES` |
| `message` | required, trimmed, 1-2000 |

**Ticket lookup** (`POST /api/query/status`):

| Field | Constraint |
|---|---|
| `refNumber` | required, trimmed, `/^[Ss][Pp][Rr]-\d{8}-\d{4}$/` |
| `email` | required, trimmed, `.email()` |

Each case starts from a fully valid submission and overrides **one** field, so a
rejection is attributable to the field under test rather than to a neighbour that
happened to be invalid too.

## The six technique groups

93 cases in total:

| Group | Cases | Fields | What it tests |
|---|---|---|---|
| Injection | 21 | message, name, subject | XSS, SQL, template, XXE, null byte, CRLF |
| Normalisation | 8 | message, name | fullwidth, zero-width, RTL-override forms |
| Email grammar | 28 | email (both schemas) | 4 valid shapes, 10 invalid shapes |
| Boundary | 21 | message (2000), name (100), subject (150) | off-by-one triple, empty, whitespace, emoji |
| ReDoS | 4 | email | catastrophic-backtracking shapes, timed |
| Reference number | 11 | refNumber | pattern anchoring, case, Unicode digits |

Every payload declares its own expectation — the same discipline the image
mutants use, and for the same reason — plus a `probes` string saying why the case
exists, which is surfaced in the report so a finding explains itself without
anyone opening the corpus file.

## Two negative results, stated plainly

Both are worth recording rather than quietly dropping. "We looked and it is safe"
is a finding.

### ReDoS: not vulnerable

A backtracking regex on a nested-quantifier input can take exponential time — a
denial of service from a single form submission. The probes are the classic
shapes: a 60/60 local-and-domain repeat, a 5,000-character local part, 500
repeated dots, 500 repeated `@`s.

Joi's email validator does not backtrack. All four return in about 1 ms.

The assertion is a **time bound, not a verdict**: `SLOW_MS = 250`. A validator
that eventually returns the right answer after eight seconds has already failed.
250 ms is three orders of magnitude of headroom, so it will not flap on a busy CI
runner, and it will still catch a genuine catastrophic backtrack. The slowest
observed validation is printed in every report, so a bound nobody is watching is
still a bound somebody would notice moving.

### Injection payloads are ACCEPTED, deliberately

This is the assertion most likely to be "fixed" in the wrong direction by
someone later, so it has its own test and this paragraph.

A contact form whose message field rejects an angle bracket or the word `select`
is a **broken contact form**. Someone reporting a bug in the scanner may
legitimately need to paste markup. Safety at this layer is **escaping on output,
not refusal on input**, and a validator that confuses the two produces a filter
that blocks real users while stopping nothing.

So what is being tested is not "does it reject these" but "does it survive them,
store them faithfully, and neither crash nor mangle them". All seven injection
payloads are expected to be accepted, and a dedicated test asserts it.

## Three details worth knowing

**The normalisation pairing.** Fullwidth characters (`＜script＞`) are visually
distinct from ASCII but collapse to it under NFKC. If anything validates *before*
normalising and stores *after*, a filter that blocks `<script>` waves `＜script＞`
through and it becomes `<script>` on the way to storage. The pair is the test:
both forms must reach the same fate. Also covered: a zero-width joiner hidden
inside `scr‍ipt` (defeats a naive substring filter) and a right-to-left override
in `filename‮gnp.exe` (display-order spoofing).

**Boundaries are in UTF-16 units, not characters.** `Joi.max(2000)` counts
JavaScript string units. An emoji is two of them. So `lengthBoundaries(max)`
tests not only the classic off-by-one triple (`max-1` accept, `max` accept,
`max+1` reject) but also `max/2` emoji (accept) and `max/2 + 1` emoji (reject) —
a boundary a `.max(n)` gets "wrong" in a way nobody notices until a player pastes
a wall of plant emoji.

**Unicode digits are not `\d`.** `SPR-٢٠٢٦٠٧١٢-0001` uses Arabic-Indic digits,
which a non-unicode-mode regex does not match. Expected to be rejected, and it
is. The mirror case — leading and trailing whitespace — is expected to be
*accepted*, because `.trim()` runs before the pattern.

## Running it

```bash
npm run test:pipeline -w server -- textFuzz --coverage.enabled=false
```

Or **Studio -> Fuzzy Testing -> Text validators**. The run-count field is hidden
for this suite: the case list is fixed, so a run count would be a control that
does nothing.

## What the tests assert

| Test | Asserts |
|---|---|
| whole-suite drive | zero findings across all 93 cases, and >80 cases actually ran |
| injection accepted | all seven payloads pass `querySchema` |
| ReDoS bounded | each shape validates in under 250 ms |
| length boundaries | the full triple plus both emoji cases land exactly right |
| malformed emails rejected | more than five invalid shapes, all refused |
| harness has teeth | a known-good expectation is checked in both directions, so a vacuous oracle cannot pass |

The teeth check matters more here than on the image side, precisely *because* the
suite reports zero findings. From the outside, a correct validator and a broken
oracle look identical.

## Not built from this part

These belong here rather than in Part 4, because they only make sense against
text:

**Coverage-guided feedback.** Free, deterministic, and coverage is actually
meaningful because the logic under test is code in this repo rather than a remote
model. Emit a JSON coverage report per generation and feed it back as fitness.
This is the honest home for the feedback loop — do not fake one on the image
side.

**EBNF done properly.** `EMAIL_PAYLOADS` is a hand-written corpus, not a
generator. Email has a real grammar: generate valid, near-valid and invalid
addresses from it, and show the parse trees. Quoted local parts, IP literals,
plus-addressing, consecutive dots, trailing dot, IDN. This is where the grammar
material gets its full treatment, with a grammar nobody has to be convinced
exists.

**Symbolic execution.** The validators are small, pure and total, which makes
them genuinely tractable: solve the path constraints to derive boundary inputs
rather than searching for them. State plainly in the write-up that this is the
technique's **ceiling** — you can symbolically execute a length check, and you
cannot symbolically execute a diffusion model. Naming where a technique stops
working is a stronger result than pretending it applies everywhere.

**An authorisation test wearing a fuzzing costume.** A *valid* reference number
belonging to *someone else*. Not a malformed-input problem, and usually the one
that finds something.

**Files that would be added:**

```text
server/pipeline/fuzz/text/emailGrammar.ts    RFC-derived EBNF + generator
server/pipeline/fuzz/text/coverage.ts        JSON coverage -> fitness
```

---

# Part 4 — Roadmap

Everything above this line is built, tested and green. Everything below is not
built. It is ordered by dependency: each item unblocks the ones after it, so
build top to bottom rather than picking the interesting-looking one.

> The random-testing baseline used to be Step 1 of this roadmap. It is built, and
> now lives in [Part 2](#part-2--the-random-baseline). The text harness used to
> be a plan; it is built, and lives in
> [Part 3](#part-3--the-text-validators).

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
| Random testing | works, finds little | **dies at the ingest gate — measured: 0/10,000** |
| Mutation-based | works | works, and is the only way past the gate |
| Generation-based (EBNF) | works, email has a real grammar | needs reinvention: container grammar *and* scene grammar |
| Coverage-guided feedback | works, coverage is meaningful | meaningless — the logic under test is inside Plant.id |
| Genetic algorithms | affordable | only with a free surrogate fitness function |
| Symbolic execution | works on the validators | does not transfer at all |
| Crash oracle | sufficient | insufficient — needs metamorphic relations |

Producing that table with evidence behind each cell is the deliverable. Row 1 now
has evidence; the rest do not.

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
- **Mutants declare their own delivery.** Same rule, same reason. Sending a
  Buffer where the route sends a string tests a branch production never takes.
- **The harness calls production code, not a copy of it.** Thresholds, keys and
  argument order come from the same resolvers the routes use.
- **Nothing may need more than 512 MB.** The studio runs these in-process on the
  free Render instance. Measure RSS before committing a new strategy.

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

## Step 1 — Findings As Artifacts

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

## Step 2 — Record-Replay Cassettes

**Why.** With Step 1 capturing real upstream responses, those responses become
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

## Step 3 — Metamorphic Relations

**This is the highest-value item in the roadmap.** Everything before it is
plumbing to make it affordable.

**Why.** The only content oracle today is "the mutation was `pixel_noise`, so
any confident answer is wrong" — which works solely because the answer was
hardcoded. Metamorphic testing removes that dependency: instead of asking *is
this output correct*, it asserts *relations between the outputs of related
inputs*. No ground truth needed, which is precisely the problem with testing a
model whose job is to know things you do not.

**Build two families.**

**3a. Invariance relations.** Transform an input in a way that cannot change
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

**3b. Monotonicity relations.** Interpolate a real photo toward uniform noise in
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

## Step 4 — Generation-Based Fuzzing

**Why.** Mutation starts from real photos and can only ever wander outward from
them. Generation reaches inputs mutation cannot construct at all. The course
teaches this over an expression grammar; the interesting move is that images
admit **two different grammars at two different levels**, and saying so is most
of the novelty claim.

**4a. Container grammar (targets the decoder and the gate).**

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

The forged-IHDR trick in `extreme_resize` is a one-off, hand-rolled instance of
exactly this idea — patch a header field, fix the CRC, hand it over. The grammar
generalises it.

**4b. Scene grammar (targets the model).**

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

## Step 5 — Genetic Search With A Surrogate

**Why.** GA needs many generations and the pipeline costs money per evaluation,
so the textbook form is unaffordable. The standard escape is a **surrogate
fitness function**: evolve against a free local model, then spend real money
only on the elite few.

**Build.**

- **Population** — candidate images, seeded from Step 4b scenes.
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

## Step 6 — EXIF As A Trust Boundary

**Why.** This is the bridge between the image work and the text work, and it
stops the two halves reading as unrelated projects. Image files carry text
metadata. If any of it reaches storage or the UI, an image is a delivery vehicle
for exactly the injection payloads Part 3 already has on hand — and the boundary
is not where anyone expects it to be.

Note the current mutation table treats `exif_abuse` as `accept`, which is
correct *for the gate*. The question here is different: what happens downstream.

**Build.** EXIF fields (`ImageDescription`, `Artist`, `UserComment`,
`Software`) carrying:

- a `<script>` tag,
- an SQL fragment,
- the same payloads in fullwidth form (`﹤` / `﹥`), to test whether
  anything normalises **before** validating rather than after,
- a `COM` segment of several megabytes.

Reuse `INJECTION_PAYLOADS` and `NORMALISATION_PAYLOADS` from
`fuzz/text/payloads.ts` rather than writing a second corpus — that shared import
*is* the bridge.

**Also here: decompression bombs by ratio.** The gate handles the
declared-dimensions case at Stage 1, and `extreme_resize` now tests it with a
forged header. Add the compression-ratio case — a small PNG that genuinely
expands to gigabytes — and assert the pixel ceiling catches it on declared size
before allocation.

**Acceptance.** A trace of where each EXIF field ends up: dropped at the gate,
stored, or rendered. Any field that reaches a template unescaped is a real
finding and should be written up as one.

## Step 7 — The Dedupe Race

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

# Part 5 — The Presentation

Image fuzzing is thin in the literature, so the framing that earns the talk is
the *comparison*, not either harness alone. Suggested arc:

1. **The funnel.** 10,000 random payloads, zero survivors past the gate, split
   5,060 / 4,940 across two rules. The course's claim, measured here. Establishes
   why mutation-based is not a preference but a necessity. *(Built — Part 2.)*
2. **Mutation-based, and the 38 false findings.** The oracle-before-bug lesson.
   Audiences remember the mistake more than the method. *(Built — Part 1.)*
3. **The oracle problem.** A crash oracle passes a pipeline that renders a
   confident fern from static. Introduce `silent_bad_output`. *(Built.)*
4. **The control group.** The text validators: same techniques, a domain where
   both classical assumptions hold, and two clean negative results. *(Built —
   Part 3.)*
5. **Metamorphic relations.** How to test a model without ground truth. Land the
   confidence-vs-noise curve here — it is the headline. *(Not built.)*
6. **Generation-based, twice.** Container grammar for the decoder, scene grammar
   for the model. Show the grid of generated scenes. *(Not built.)*
7. **GA with a surrogate.** The cost problem and the transfer result. *(Not
   built.)*
8. **Where the techniques stop.** The two-assumption table from the top of Part
   4, now with evidence in every cell. This is the contribution.

Two smaller stories that land well and are already true:

- **The gigabyte.** A fuzz strategy that allocated 1 GB to test a rule the gate
  enforces on 289 bytes of header. Good on the point that the fuzzer is code too,
  and gets things wrong the same way the target does.
- **The Buffer that skipped a rule.** The harness handed `Buffer`s where the route
  hands strings, so an entire validation rule was unreachable from any fuzz run,
  and the suite was green about code nobody executes. Good on fidelity: a fuzzer
  must call the target the way production calls it.

**Related work to have in hand.** Metamorphic testing (Chen et al., 1998, and
its ML applications); DeepXplore and neuron coverage; DeepTest; TensorFuzz; and
the long history of AFL against libjpeg and libpng for the container-level side.
Verify publication details before citing — that list is from memory and the ML
testing literature moves quickly.

**What to be honest about in the talk.** Live mode has still never been run
against real APIs. Non-determinism means an `L2`/`L3` finding may not reproduce.
Surrogate transfer may simply not happen. Two of the three built suites are not
yet wired into CI. A negative result, stated clearly, is a better talk than an
overstated positive one.

---

# Related

- [DEPLOYMENT.md](DEPLOYMENT.md) — how CI and the deployments fit together
- [AGENT_HOOKS.md](AGENT_HOOKS.md) — the pre-commit checks that run alongside
- [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md) — client/server API contract
