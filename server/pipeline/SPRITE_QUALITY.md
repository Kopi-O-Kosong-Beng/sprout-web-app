# Sprite Quality Rubric

Nat's accumulated feedback on sprite generations. This file is the source of
truth for what an acceptable sprite looks like. Update it every time a batch is
reviewed; the distilled rules below should always reflect the full feedback log.

The generation prompt lives in `stages/promptCraft.ts` (`buildInstruction` /
`nameOnlyPrompt`); when the rules here change, that prompt is the lever.

## Distilled rules

### 1. Eyes are make-or-break (most common rejection cause)

The single most frequent reject reason. A sprite with perfect design and bad
eyes is still a reject. Nat's calibration (2026-08-10): eyes "just need to be
drawn well, don't need to be chibi" — the failure is sloppy execution, not
small size per se. Jasmine #2 (accepted, "excellent") has small simple eyes
that are cleanly drawn.

- **Good**: well-drawn, symmetric, deliberate, friendly. Large dark glossy
  eyes with catchlight highlights (hydrangea #4, murraya #4) are one proven
  style, not a requirement.
- **Bad — lazy dots**: black dot eyes that read as unfinished
  (hydrangea #1, #3, #7).
- **Bad — googly/mismatched**: white or yellow sclera-heavy, asymmetric,
  off-centre derpy eyes (hydrangea #6, murraya #3).

### 2. Carry the plant's signature structure through, in real detail

The design should visibly inherit the species' most distinctive trait —
rendered as itself, not abstracted away.

- **Good** (hydrangea #3, "design style is perfect"): the pom-pom cluster of
  individual four-petal florets carried over as a distinct crown/topknot on a
  chubby creature body. Individual florets are readable.
- **Bad — over-simplified**: florets abstracted into a smooth scale pattern
  (#1) or dropped entirely for a plain blob with leaf trim (#2). "Too simple"
  is a reject on its own.

### 3. Creature body + plant feature, not plant-with-a-face

The winning shape is a chubby creature body (bird-like, round, with tiny feet)
wearing the plant trait as a feature (crown, ruff, tail). A ball of flowers
with a face patch stuck on (#7) reads as too simple.

### 4. Never human-like — immediate reject

Human skin tones, human facial proportions, or anything that reads as a
person in a plant costume (hydrangea #5) is an instant reject, regardless of
everything else. This includes plain humanoid *silhouettes*: a featureless
white blob with a toddler head/body shape (jasmine #5) is "too human" even
with no skin tone. It must read as a cute plant *monster*.

### 5. Novelty: avoid the cliché plant-monster archetypes

"Flower head on a stub body" is everywhere in the genre; a technically clean
sprite using that template is only a weak accept (jasmine #4: "not very
special"), and "cute but overly generic" is a full reject (murraya #1, a
flower-covered ball with a face). The strong accepts built their body plans
from the species' *less obvious* structures: jasmine #2 used the teardrop bud
as the body, pinnate leaves as arms, the twining vine as a curling tail;
murraya #4 used the shrub's dense glossy foliage as a shaggy leaf body with
the small white flower clusters as a modest crown. Prefer the growth habit
and secondary structures over the default flower-face-on-blob — cuteness does
not rescue a generic design.

### 6. Get the species' signature number/geometry right

Jasmine has five petals; the accepted sprite (#2) lost that trait and it was
the named improvement point. Like hydrangea's individual florets, the
species' countable signature (petal count, floret cluster, leaf arrangement)
should be carried accurately somewhere on the creature.

### 7. Nothing scary or off-model cute

Three eyes (jasmine #3) read as alien/scary — instant reject territory.
Exactly two eyes, friendly expression, no unsettling features.

### The target

> A body plan invented from the species' distinctive growth habit (jasmine
> #2's bud-and-vine, murraya #4's foliage body — never the generic
> flower-on-blob), the species' signature structures carried in accurate
> detail (hydrangea #3's individual florets, correct petal counts), and
> well-drawn friendly eyes (hydrangea #4, murraya #4) = the bar.

## Feedback log

### 2026-08-10 — Hydrangea, 7 generations

| # | Description | Verdict | Why |
|---|-------------|---------|-----|
| 1 | Green round body, blue florets abstracted into scale-cap, dot eyes, blush | REJECT | Too simple; bad eyes |
| 2 | Blue axolotl-like blob, green leaf frills, big flat eyes | REJECT | Even simpler; bad eyes |
| 3 | Green chubby bird-body, detailed blue floret pom-pom crown, leaf wings, dot eyes | reject (design ✓) | Design style perfect — floret cluster carried over; eyes not cute |
| 4 | Blue round body, floret crown, large glossy dark eyes w/ highlights, leaves | ACCEPT (can be better) | Eyes good; design good but #3's design is better |
| 5 | Human face (skin tone) in a floret ball with leaf collar | REJECT (immediate) | Too human-like; no longer a cute plant monster |
| 6 | Blue body, floret crown, leaves, mismatched white googly eyes | reject (design ✓) | Design acceptable; eyes bad |
| 7 | Whole body one floret ball, dark muzzle patch, small eyes | REJECT | Too simple; bad eyes |

### 2026-08-10 — Jasminum officinale, 5 generations

| # | Description | Verdict | Why |
|---|-------------|---------|-----|
| 1 | White flower head (yellow centre) on green leafy sheep-like body, face in flower | REJECT | Too simple |
| 2 | Teardrop jasmine-bud body, pinnate leaf arms, long curling vine tail, cute face | ACCEPT (best) | Excellent, inventive body plan from bud + vine habit; improvement: carry the five-petal trait across |
| 3 | White pom head with three black dot eyes, green bird body, vine tail | REJECT | Too simple, not cute, a little scary (three eyes) |
| 4 | Green stub body with five-petal white flower face, pinnate leaves, side bud | accept (weak) | Clean but generic — "flower head on stub body" is a common archetype, not special |
| 5 | Plain white blob, leaf ears, simple smile | REJECT | Too human (humanoid toddler silhouette) |

### 2026-08-10 — Murraya paniculata, 4 generations

| # | Description | Verdict | Why |
|---|-------------|---------|-----|
| 1 | Ball covered in white five-petal flowers, glossy eyes, leaf base | REJECT | Cute but overly generic (flower-ball-with-face archetype) |
| 2 | Green fluffy body, single big flower on head, dot eyes | REJECT | Too simple |
| 3 | White flower face, leaf-collar body, offset yellow googly eyes, twig legs | REJECT | Looks scary |
| 4 | Shaggy leaf-ball body from shrub foliage, tiny white flower crown, big glossy well-drawn eyes, bird feet | ACCEPT | Species-true foliage body, flowers as accent, good eyes |
