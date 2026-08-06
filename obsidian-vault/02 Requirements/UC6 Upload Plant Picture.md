---
tags: [use-case, upload, ai-pipeline, checkoff3, final]
id: UC6
source: C3T2_UseCaseDescription_1D.docx, Sprout_Features.md, Sprout_Storage_IP.md, team decision 2026-07-20, docs/superpowers/specs/2026-08-02-scan-to-archive-persistence-design.md, branch features/zhifeng/scan-to-archive-persistence
updated: 2026-08-02
---

# UC6 - Upload Plant Picture

UC6 is an independent base use case. It populates the collection whether or not the user starts PVE.

**Checkoff 3 evidence:** primary integrated vertical slice.  
**Description:** A verified user uploads a plant image. Sprout identifies the species, reuses or creates one versioned canonical sprite, records the species as `VISITED` in the user's collection, and attributes first discovery of the species to whoever scanned it first.  
**Actors:** Primary - User. Secondary - Plant Identification Service, Prompt/Image Generation Service, Background Removal Service.  
**Trigger:** User submits a plant image.  
**Precondition:** User has a verified authenticated session.  
**Postcondition:** A successful scan event and one user/species collection entry exist; a completed canonical sprite is referenced; **the species now appears in the user's [[UC4 Browse Avatar Archival|archive]] on the next load, persisted rather than lost on refresh.**  
**Error states:** Invalid/oversized file, rate limit, low confidence, provider timeout, generation/post-processing/storage failure. A persistence failure after a successful generation is reported as a distinct save fault - the sprite still displays, `saved` is `false`, and the run is not treated as a crash.

## Operation flow

1. User selects or captures a plant image.
2. Sprout validates magic bytes, accepted format, size, and upload rate.
3. Sprout sends the valid image to the identification adapter.
4. The adapter returns a stable species ID, names, taxonomy, and confidence.
5. Sprout checks confidence is at or above the configured threshold.
6. Sprout upserts species metadata by stable species ID.
7. Sprout looks up the canonical asset by species ID and generation recipe version.
8. On a cache hit, Sprout reuses the completed canonical asset.
9. On a cache miss, Sprout acquires the unique recipe-generation lock.
10. The winning request creates a structured prompt and requests the configured Gemini image model.
11. Sprout removes the background, crops/pads square, resizes to 56x56, quantizes nontransparent RGB to FLORENTINE24, preserves alpha, and calculates a checksum.
12. Sprout stores the immutable PNG to Firebase Storage under a canonical per-species path - one object per species, not per scan - and marks the asset complete. If the object already exists, its download token is reused, so the second and later scans of a species cost nothing.
13. Concurrent losing requests reuse the completed winning asset. The first write to the path is create-only; a losing concurrent writer re-reads the object and hands back the winning token instead of a dead link.
14. Sprout upserts the caller's archive record, de-duplicated on the caller's own sanitized species name: a first scan creates a persistent entry (`VISITED`, `source: 'web'`, not temporary) with hp/attack/defense/speed derived deterministically from the species key; a repeat scan leaves the original discovery date untouched, stamps `metadata.lastSeenAt`, and upgrades a previously-temporary entry to persistent.
15. Sprout records first-discoverer attribution for the species: the first-ever scan of that species stamps `firstDiscoveredBy` and `firstDiscoveredAt`; every scan of it, first or not, increments a `discoveryCount` inside one transaction.
16. Sprout returns species, canonical sprite, provenance, and collection data.
17. The client displays the result and makes it available in [[UC4 Browse Avatar Archival]]. The archive detail view is the first place in the app one user sees another user's identity - the discoverer's display name only, never their email - and degrades to showing no discoverer rather than failing the request if the dex or user record is missing.

## Alternative flows

- **2a Invalid image/type:** return `INVALID_IMAGE`; no external provider is called.
- **2b Over 5 MB:** return `IMAGE_TOO_LARGE`; no external provider is called.
- **2c Rate exceeded:** return `RATE_LIMITED`.
- **5a Below threshold:** record the outcome, return `LOW_CONFIDENCE`, and suggest a better image.
- **3a Identification timeout/failure:** return `IDENTIFICATION_UNAVAILABLE`.
- **10a Generation failure:** mark recipe failed/retriable and return `GENERATION_FAILED`.
- **11a Background/post-processing failure:** do not mark a completed asset; return `POSTPROCESS_FAILED`.
- **12a Storage failure:** do not point collection data at a missing object; return `STORAGE_FAILED`.
- **14a Archive persistence failure:** the run still completes and the sprite still displays; the `complete` event carries `saved: false` and a `saveError` instead of aborting, so a save fault stays visibly distinct from a generation crash.

## Rules

| Rule | Decision |
|---|---|
| Formats | JPEG, PNG, WEBP verified by magic bytes |
| Max upload | 5 MB, enforced client and server side |
| Confidence | Named config, default 0.70; diagram text says "at or above configured threshold" |
| Rate limit | 5 uploads per verified user per hour |
| Canonical key | `speciesId + promptVersion + modelVersion + paletteVersion` |
| Palette version | `florentine24-v1` |
| Collection uniqueness | `(userId, speciesId)` |
| Web provenance | Always `VISITED`; web cannot assign `CAUGHT` |
| Repeated scan | Update `lastSeenAt`, retain `firstSeenAt`, no duplicate entry |
| Private photo | Optional private storage path; never required to serve canonical art |
| Sprite object path | `sprites/{speciesKey}/v1.png` in Firebase Storage; one object per species, create-only write |
| Battle stats | hp/attack/defense/speed derived deterministically from the species key by a pure hash - same species gives the same numbers on every machine and every run, unlike the pipeline's own `maxHealth: 100` and `Math.random()` speed |
| First-discoverer attribution | `dex` collection keyed by species, one document per species; `firstDiscoveredBy`, `firstDiscoveredAt`, `discoveryCount` incremented in a transaction; archive detail exposes the discoverer's display name only, never an email |

Provider payloads, model prompts considered sensitive, credentials, and stack traces are never returned to the client. Deterministic fakes are the normal automated-test and backup-demo path.

## Related

[[GenAI Sprite Pipeline]] · [[Database Schema]] · [[QA Sprite Storage and Web Cache]] · [[UC4 Browse Avatar Archival]] · [[Testing Strategy]] · [[Open Questions and Inconsistencies]]
