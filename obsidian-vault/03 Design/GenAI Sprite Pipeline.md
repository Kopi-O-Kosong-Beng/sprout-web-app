---
tags: [design, ai-pipeline, sprites, checkoff3]
source: Sprout_Features.md, Sprout_Storage_IP.md, Android reference audit, team decision 2026-07-20
---

# GenAI Sprite Pipeline

The web pipeline produces one versioned canonical creature sprite per stable species identity. Personalization lives in the user's photo, nickname, provenance, dates, and progression rather than a newly generated image for every scan.

## Data flow

```text
validate upload
-> identify stable species ID and confidence
-> read/acquire canonical recipe key
-> cache hit: reuse asset
-> cache miss winner: prompt -> Gemini image generation -> remove.bg
-> crop/pad square -> resize 56x56 -> FLORENTINE24 quantization
-> preserve alpha -> PNG -> checksum -> immutable object storage
-> upsert VISITED collection entry -> return archive result
```

Unique recipe key:

```text
speciesId + promptVersion + modelVersion + paletteVersion
```

The prompt and image models are accessed through separate adapters. The configured Gemini image model may change when tokens are refreshed without changing `ScanService` or the domain contract.

## Post-processing order

1. Generate the source image with the approved structured house-style prompt.
2. Remove the background before color reduction.
3. Crop/pad to a square canvas.
4. Resize to 56x56.
5. For every nontransparent pixel, map RGB to the nearest FLORENTINE24 color.
6. Preserve the source alpha value.
7. Encode PNG, calculate checksum, and persist.

Quantizing after background removal avoids mapping background/edge contamination into palette colors. Upscaling for display uses nearest-neighbor rendering and never changes the stored 56x56 source.

## FLORENTINE24 `florentine24-v1`

```text
#175145 #2e8065 #51b341 #9bd547
#fff971 #ff7f4f #ff4f4f #ee3046
#df426e #a62654 #621b52 #371848
#0c082a #261152 #272573 #4876bb
#7fd3e6 #c7f7f2 #ffffff #d29c8a
#9e4d4d #712835 #5d1835 #35082a
```

Before public/commercial release, verify FLORENTINE24 permission and attribution requirements. The project documentation should describe the team's prompt design, palette choice, quantization implementation, curation, and versioning without making unsupported legal ownership claims.

## Canonical generation lock

1. Read the recipe key.
2. If status is `COMPLETED`, return the asset.
3. If absent, atomically create `GENERATING` with lock owner/expiry.
4. The winner runs generation/post-processing/storage.
5. The winner records checksum/path and marks `COMPLETED`.
6. Other requests wait/poll for completion and reuse it.
7. A failed/expired lock can be retried; no collection record points to an incomplete asset.

This makes the "one generation per species recipe" claim testable under concurrent requests.

## Adapter boundaries

| Adapter | Returns | Stable Sprout failure |
|---|---|---|
| Plant identification | species ID, names, taxonomy, confidence | `IDENTIFICATION_UNAVAILABLE` / `LOW_CONFIDENCE` |
| Prompt service | versioned structured prompt | `GENERATION_FAILED` |
| Gemini image generation | image bytes plus provider metadata | `GENERATION_FAILED` |
| Background removal | image bytes with alpha | `POSTPROCESS_FAILED` |
| Object storage | immutable object path | `STORAGE_FAILED` |

Provider payloads and secrets stay server-side. Automated tests use deterministic fakes. A backup demo uses seeded canonical assets through the same interfaces.

## Tests that define the design lock

- Output is exactly 56x56.
- Every nontransparent output RGB value is a member of the 24-color set.
- Alpha is preserved.
- Same input/version produces the same output checksum.
- Transparent pixels do not introduce an extra visible palette color.
- Cache hit calls no generation provider.
- Concurrent cache miss performs one generation and returns one shared asset.
- Failed post-processing/storage never publishes a completed asset.

## Related

[[UC6 Upload Plant Picture]] · [[QA Sprite Storage and Web Cache]] · [[External APIs]] · [[Testing Strategy]]
