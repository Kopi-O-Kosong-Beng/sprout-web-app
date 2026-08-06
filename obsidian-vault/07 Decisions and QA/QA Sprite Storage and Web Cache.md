---
tags: [qa, decision, storage, frontend, checkoff3]
question-from: team discussion
updated: 2026-07-20
---

# Q&A - Where should Sprout store pictures?

## Decision

Use object storage as the source of truth and browser caching only as a speed layer.

| Image type | Source of truth | Access | Path |
|---|---|---|---|
| Canonical species sprite | Firebase Storage | Shared/readable through approved app rules; immutable/cacheable | `canonical-sprites/{speciesId}/{recipeHash}.png` |
| User upload/source photo | Firebase Storage | Private to owner/service | `users/{userId}/plant-photos/{scanId}.{ext}` |
| Test/demo asset | Local storage adapter/repo seed | Local only | Same logical storage interface |

Firestore/SQLite stores object paths, checksums, ownership/provenance, and version metadata. It never stores image blobs or base64 strings.

## Canonical sprite rule

The previous open question is resolved: one versioned canonical sprite per stable species ID and recipe. The unique key is:

```text
speciesId + promptVersion + modelVersion + paletteVersion
```

The first completed request stores the asset. Concurrent requests for the same key reuse it. A new model/prompt/palette version creates a new immutable asset while preserving old references for reproducibility.

Personalization remains in source photo, nickname, dates, `VISITED`/`CAUGHT`, XP, wins/losses, and optional future curated variants.

## Why browser-only storage is insufficient

- Browser cache is per device and can be evicted.
- It cannot provide Android/web synchronization.
- It cannot enforce user-photo privacy.
- It cannot coordinate one generation across users.
- Provider URLs may expire.

Use normal HTTP caching for canonical sprite URLs. Do not use `localStorage` for image data. An offline Cache API/IndexedDB layer is a later optimization, not the source of truth.

## Firebase rules direction

- Canonical sprite writes are server-only; clients cannot overwrite shared art.
- Canonical reads follow the product's chosen public/authenticated policy.
- User photo reads/writes require matching authenticated UID or trusted backend service.
- Validate MIME and maximum size at both API and storage-rule boundaries where supported.
- Never expose service-account credentials to React/Android clients.

## Billing fallback

Firebase Storage may require the Blaze plan. If unavailable for Checkoff 3, use seeded canonical files via the local adapter and demonstrate the Firebase adapter/rules as isolated cloud evidence. The API/domain contract stays unchanged.

## Related

[[GenAI Sprite Pipeline]] · [[Database Schema]] · [[UC6 Upload Plant Picture]] · [[Checkoff 3 Readiness and Development Plan]]
