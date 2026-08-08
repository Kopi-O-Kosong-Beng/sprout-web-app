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

# Related

- [FUZZ_TESTING.md](FUZZ_TESTING.md) — the gate every scanned photo passes first
- [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md) — client/server API contract
- [SPECS.md](SPECS.md) — the pipeline's stage-by-stage specification
