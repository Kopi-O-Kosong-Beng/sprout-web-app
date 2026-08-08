# Image Pipeline Fuzz Testing

This document covers the image ingest gate and the fuzz harness that tests it:
what they are, how to run them, how to read a finding, and how to extend them.

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

Read across the workspace boundary on purpose: copying them into `server/` would
give the repo two corpora that drift apart.

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

## Related

- [DEPLOYMENT.md](DEPLOYMENT.md) — how CI and the deployments fit together
- [AGENT_HOOKS.md](AGENT_HOOKS.md) — the pre-commit checks that run alongside
- [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md) — client/server API contract
