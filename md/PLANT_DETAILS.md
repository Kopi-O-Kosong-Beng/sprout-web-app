# Plant Details

What a scanned plant knows about itself, where that comes from, and what it
would take to know more.

| Part | Status |
|---|---|
| [Part 1 — What is stored today](#part-1--what-is-stored-today) | built |
| [Part 2 — What Plant.id actually returns](#part-2--what-plantid-actually-returns) | measured |
| [Part 3 — Roadmap](#part-3--roadmap) | **not built** |

---

# Part 1 — What Is Stored Today

## The gap this closed

`persistScan` wrote `metadata: null` for every scan. The route asks Plant.id for
seventeen detail fields on every identification, uses one of them (`taxonomy`,
for the family name), and threw the rest away.

The visible consequence was backwards: the five seeded **demo** plants carried
`taxonomy`, `confidence` and `locality`, so a plant a player was given had a
richer record than any plant they actually scanned. A real scan reached the
archive with a name, a family, four stats and nothing else.

## What a scan now records

Built in `buildScanMetadata` (`server/services/scan-persistence.ts`), shown by
`ArchivePage`:

| Field | Source | Shown as |
|---|---|---|
| `description` | `details.description.value` | the paragraph under the plant |
| `toxicity` | `details.toxicity` | **Toxicity** |
| `bestLightCondition` | `details.best_light_condition` | **Light** |
| `bestWatering` | `details.best_watering` ?? `details.watering` | **Water** |
| `bestSoilType` | `details.best_soil_type` | **Soil** |
| `commonUses` | `details.common_uses` | **Common uses** |
| `commonNames` | `details.common_names`, first 5 | — (held, not yet displayed) |
| `confidence` | `suggestion.probability` | — (held, not yet displayed) |

Toxicity leads the list because it is the only one a player might act on.

## Four rules the builder follows

1. **Only on a real identification.** When `identifiedSpecies` is false the
   species name is a stand-in, so care notes attached to it would describe a
   plant the player did not scan. `metadata` stays `null`.
2. **`null`, never `{}`.** The archive reads an object as "there are details
   here" and would draw an empty panel. A record with nothing to say says
   nothing.
3. **Blank fields are absent, not `undefined`.** Firestore rejects `undefined`
   values outright.
4. **Strings are capped at 600 characters.** Upstream prose is unbounded and
   this rides in every archive page payload. The client truncates to 180 for
   display anyway.

## The stage-2c leg records nothing

`/run-stage2c` — the continuation after the studio's human gate — builds a
stand-in identification (`probability: 0.95`, `common_names: [speciesName]`)
purely to satisfy the shape downstream code expects. Persisting that would
record a fabricated confidence and a "common name" that is just the species
name again.

So `details` is an explicit argument to `runStage2cOnward` rather than something
read off `identification`. That leg passes nothing, and cannot accidentally
start passing something.

---

# Part 2 — What Plant.id Actually Returns

Measured, not assumed. One live identification of
`goldenset/photos/hydrangea.jpg` on 2026-08-09 — matched *Hydrangea
macrophylla* at 0.99, `is_plant` 0.97.

## The twenty fields it returns

```text
best_light_condition   common_names            edible_parts            image
best_soil_type         common_uses             edible_parts_citation   inaturalist_id
best_watering          cultural_significance   entity_id               language
                       description             gbif_id                 rank
                       synonyms                taxonomy                toxicity
                       url                     watering
```

## Habitat and conservation status are not among them

The request asked for the seventeen fields the route normally uses **plus** six
speculative ones: `habitat`, `conservation_status`, `iucn_redlist`,
`distribution`, `native_range`, `ecology`. All six came back **absent**.

**The API silently ignores unknown `details` names.** No error, no warning,
HTTP 201. So adding `habitat` to the details string looks like it works and
yields nothing — which is roughly how the demo plants came to carry two fields
no real plant could ever have.

Both fields were removed from the demo templates for exactly this reason. A test
in `tests/scan-metadata.test.ts` asserts they stay gone, so adding them back is
a deliberate act rather than an accident.

## Three fields we fetch and still discard

`cultural_significance`, `edible_parts` and `synonyms` are populated and unused.
Not an oversight — they are lower value per line of card space than the five
care notes — but they are free if a use appears.

---

# Part 3 — Roadmap

Neither item below is built.

## Item 1 — Native range, parsed from the description

**Why.** The description we already store frequently states it outright. For the
hydrangea: *"Hydrangea macrophylla is a species of flowering plant in the family
Hydrangeaceae, **native to Japan**."* No new API call, no new dependency, and the
text is already on the record.

**Why it is not built.** It is free prose. Extraction would be a regex over
sentences that Plant.id makes no promise about, so it would be right often and
silently wrong sometimes — and a plant card asserting the wrong native range is
worse than one that says nothing. It also cannot be evaluated: there is no
ground truth in the response to check an extraction against.

**If built.** Present it as *"Origin"* with visibly hedged wording, populate it
only on a confident match, and leave the field absent otherwise. Never present a
parse as though it were a fact from the provider. Test it against all ten
golden-set photos and record the hit rate here; below about 80% it is not worth
shipping.

## Item 2 — Conservation status, from a second source

**This is the one to build if conservation status is genuinely wanted**, and it
is the reason the field was removed rather than faked.

**Why it works.** The Plant.id response already hands over primary keys into two
biodiversity databases:

```text
gbif_id        = 2985994      -> gbif.org
inaturalist_id = 122034       -> inaturalist.org
```

Both have free public APIs carrying distribution and conservation data. The IUCN
Red List has its own API and is the authoritative source for conservation
status, though it requires registration.

**Shape of the work.**

- A lookup keyed by `gbif_id` / `inaturalist_id`, called **once per species**,
  not once per scan. Cache by species key, exactly as `sprite-storage` does —
  the same species scanned by a hundred players is one lookup.
- Populate `conservationStatus` on the dex record rather than the avatar
  record: it is a property of the species, not of anyone's particular
  photograph, and the almanac already reads per-species data.
- Fail open. A lookup failure must leave the field absent and never turn a
  successful scan into a failed one — the same rule `resolveDiscovery` follows.

**Files it would touch.**

```text
server/services/conservation.ts        the lookup, cached by species key
server/repositories/dex.ts             where the status would live
server/services/scan-persistence.ts    call site, after the dex write
```

**Acceptance.** A species with a known IUCN status shows it; an unknown one
shows nothing rather than "Unknown"; the lookup happens once per species across
repeated scans, asserted by counting calls; and a provider outage leaves scans
saving normally.

**Then, and only then**, restore the archive's *Conservation status* row and put
the promise back in the landing copy — it was removed in the same change that
removed the fields, since advertising a detail nothing can produce is worse than
not advertising it.

---

# Appendix — The Chroma-Key Backdrop That Flux Would Not Paint

A measured negative result, kept so nobody spends the same credits proving it
twice. Re-runnable: `npm run backdrop:experiment -w server -- --confirm-spend`.

## Why it looked like a good idea

`finishSprite` has to tell background from creature, and with a white backdrop
it cannot. White is **distance 0 from SPROUT_PALETTE** — it is literally palette
entry `#FFFFFF` — so any leftover backdrop snaps to exactly the same value as a
legitimately white plant pixel. Portulaca grandiflora came back as a white
creature on a white field with roughly 7,500 px of background still baked in,
and nothing downstream could detect it.

A backdrop far from the palette would fix that. Measured distances:

| Candidate | Nearest palette entry | Distance |
|---|---|---|
| white `#FFFFFF` | `#FFFFFF` | **0** |
| chroma blue `#0000FF` | `#565FBF` | 143 |
| magenta `#FF00FF` | `#DE5995` | 142 |
| cyan `#00FFFF` | `#59F7FF` | 89 |
| chroma green `#00FF00` | `#26FF43` | 77 |

Magenta was chosen over blue on two grounds: nine palette entries are
recognisably blue, so leftover blue would read as a deliberate design choice,
and blue flowers are real — hydrangea is in the golden set. A magenta failure
is unmissable.

## What actually happened

Six Flux renders, three pale/white-flowered species with the backdrop clause as
the only variable:

| Subject | Backdrop asked for | Border match | Corner offset |
|---|---|---|---|
| Portulaca grandiflora | pure-white | **100.0%** | 2 |
| Portulaca grandiflora | pure magenta | **0.0%** | 253 |
| Leucophyllum frutescens | pure-white | **100.0%** | 2 |
| Leucophyllum frutescens | pure magenta | **0.0%** | 253 |
| Achillea millefolium | pure-white | **100.0%** | 3 |
| Achillea millefolium | pure magenta | **0.0%** | 253 |

**Flux ignored the instruction completely.** 253 is the distance from magenta to
white, so it painted white every time. Compliance with `pure-white` is
essentially perfect; compliance with a chroma key is zero.

Not a tuning problem. The clause sits in the same sentence, in the same
position, with the same surrounding words — the only thing that changed is the
colour named, and the model overrode it. Rewording might move it; nothing in
this result suggests it would move far.

## What follows

- **Do not change the backdrop colour** while Flux is the renderer. Re-run the
  experiment if the renderer changes; a model that obeys would make the
  detectability argument live again.
- **Connectivity is the tool that works.** A flood fill inward from the frame
  edge cleared 7,547 px of un-removed background from the Portulaca sprite and
  stopped dead at the creature's black outline, leaving all 7,853 interior white
  pixels intact. The bold black outline the style already demands is what makes
  this safe — it is a wall the fill cannot cross.

  This now ships as `clearBorderConnectedBackdrop` in
  `server/pipeline/stages/finish.ts`, behind `finishSprite`'s `keyBackdrop`
  option. The pipeline sets it only when withoutBG returned a real cutout
  (`removeBgOk`); a passthrough render keeps its background baked in, because
  that visible degradation is the contract the golden set's
  `edge_removebg_degraded` case pins (`hasAlpha: false`). Validated against the
  three white-backdrop experiment renders: the full white field cleared on all
  three, interior whites survived (2,513 px of white flower on Portulaca).
- **Colour alone was never sufficient anyway.** The earlier local keyer was
  reverted because it matched on a sampled corner colour with no connectivity,
  so a sprite touching the frame edge lost chunks of itself. Connectivity is the
  fix; a different colour would not have been.

# Sprite candidates and the Dex Gate

A rescan's render used to be discarded outright — storage saw
`sprites/<key>/v1.png` existed and returned the old URL — so the studio's Dex
Gate had nothing real to act on (it showed a hardcoded demo store). The gate
model now, decided 2026-08-09:

- **First publishes, rest queue.** The first-ever scan of a species stores
  `v1.png` and publishes it as the global reference immediately (the almanac is
  never left without a sprite). Every later render is stored as `v<N>.png` plus
  a PENDING row in `dex_candidates`, carrying the pipeline's evaluation
  (judge score, cutout, confidence, auto-approve verdict).
- **Publishing is manual and atomic.** The studio's Dex Gate lists real species
  and candidates; publishing one transactionally sets it PUBLISHED, demotes the
  incumbent to PENDING (re-publishable, never lost), and points `dex.spriteUrl`
  at it. Rejecting the currently published sprite is refused (409).
- **Players are untouched.** Archive records keep whatever sprite the player
  earned; only the shared reference (almanac, discovery views) is governed.
- **Unidentified/mock scans never become candidates** — their species keys are
  user-scoped and are filtered out of the gate.

Auto-approve (`shouldAutoApprove`) is recorded on the candidate as advisory
context; it does not publish anything by itself.

# Related

- [FUZZ_TESTING.md](FUZZ_TESTING.md) — the gate every scanned photo passes first
- [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md) — client/server API contract
- [SPECS.md](SPECS.md) — the pipeline's stage-by-stage specification
