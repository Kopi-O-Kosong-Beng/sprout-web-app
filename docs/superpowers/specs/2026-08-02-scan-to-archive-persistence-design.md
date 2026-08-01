# Scan-to-archive persistence (UC6 -> UC4)

**Date:** 2026-08-02
**Owner:** Zhi Feng (with Nat)
**Status:** approved design
**Target:** final deliverable, team deadline 2 Aug

## Problem

`POST /api/pipeline/run-stream` runs the six generation stages and streams the
finished sprite back to the browser. Nothing persists. A refresh loses the
result, and the Archive page still shows only seeded demo records.

The consequence: **UC6 cannot be claimed as end-to-end.** The upload-to-archive
provenance chain the vault has described since 2026-07-20 does not exist in
code.

The route itself is already authenticated. `pipeline.routes.ts:39` applies
`router.use(authMiddleware)`, added with the platform migration in `627c6b0`,
and `tests/app-config.test.ts:46` asserts the 401. So `req.user.uid` is already
available to attribute a scan to its caller — what is missing is the writing,
not the identity.

## Scope

In: authentication on the pipeline routes, canonical sprite storage, the
archive write, per-user species de-duplication, deterministic battle stats,
first-discoverer attribution, and the failure path.

Out: a discoverer leaderboard page, sprite regeneration/versioning beyond `v1`,
UC7 PVP, and any change to the battle engine itself.

## Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Sprite bytes go to **Firebase Storage**, not an inline data URL | Matches the canonical-sprite design; `spriteUrl` keeps its meaning; archive list payloads stay small |
| D2 | Web scans create **persistent** records (`isTemporary: false`, `expiresAt: null`) | Chosen over the model's 24h TTL comment so nothing expires before the showcase |
| D3 | De-duplication keys on **`sanitizeSpeciesKey(speciesName)`**, matched in memory | Reuses the existing function; no schema change, no composite index, no migration for demo records; consistent with the filter-then-work-in-memory approach `repositories/avatars.ts` already documents |
| D4 | Battle stats are **derived deterministically from the species key** | The pipeline supplies only `maxHealth: 100` and a `Math.random()` speed of 5-20, which is unusable against the NPC and unrepeatable in tests |
| D5 | Persistence lives in **`runStage2cOnward`** | The shared tail both entry points call, so the human-gate path cannot bypass it |
| D6 | A persistence failure still returns the sprite, flagged `saved: false` | Generation succeeding but saving failing must not look like a pipeline crash |
| D7 | Species-level **first-discoverer** record, no leaderboard | The `DexDoc` shape already anticipates it and the Studio page already reads the collection; a leaderboard is a separate feature |

## Design

### Data flow

```
ScanPage --(photo + Firebase ID token)--> POST /api/pipeline/run-stream
  [authMiddleware -> req.user.uid]
  identify -> promptCraft -> generate -> removeBg -> finish -> assemble
  -> SpriteStorage.save(speciesKey, png)      -> canonical URL
  -> dexRepo.recordDiscovery(speciesKey, uid) -> first discoverer + count
  -> avatarRepo.upsertFromScan(uid, ...)      -> avatar_records
  -> emit 'complete' { finalPlant, finalSpriteB64, avatarId, saved, discovery }
```

### A. Authentication

Already in place; no route change is required. `pipeline.routes.ts:39` applies
`router.use(authMiddleware)` to both `/run-stream` and `/run-stage2c` — the same
guard `routes/avatar.routes.ts:24` applies to the archive. `req.user.uid`
becomes the record owner.

Client: `client/src/services/pipelineStream.ts:26-33` already attaches
`Authorization: Bearer <idToken>` via `authHeaders()` whenever Firebase is
configured and a user is signed in, and `streamPipeline` uses it at line 47.
`ScanPage` calls `streamPipeline`, so no header work is needed either. What does
change for the client is that a signed-out user's 401 currently surfaces as the
unhelpful `Pipeline API HTTP 401` (`pipelineStream.ts:52`); that message is
fixed in the client task.

### B. Sprite storage

New `server/services/sprite-storage.ts`:

```ts
export interface SpriteStorage {
  /** Saves the PNG for a species and returns a durable URL. */
  save(speciesKey: string, png: Buffer): Promise<string>;
}
```

The Firebase implementation writes `sprites/{speciesKey}/v1.png` with a
`firebaseStorageDownloadTokens` UUID and returns the resulting permanent
download URL. **Canonical per species:** if the object already exists its URL is
returned without re-uploading, so the second user to scan a given species costs
nothing.

Dependencies are injected in the same shape as `scripts/check-storage.ts`
(`createFile(bucketName, objectName)`), so unit tests substitute a fake and
never touch the network. The bucket name comes from `FIREBASE_STORAGE_BUCKET`,
already validated by `requireBucketName`.

### C. Archive write and de-duplication

New method on `AvatarRepository`:

```ts
interface ScanUpsertInput {
  speciesName: string;              // canonical name from identification
  speciesFamily: string | null;     // taxonomy.family, null on the resume path
  spriteUrl: string;                // canonical URL from SpriteStorage
  stats: AvatarStats;               // derived, see section D
  metadata: Record<string, unknown> | null;
}

upsertFromScan(
  userId: string,
  input: ScanUpsertInput
): Promise<{ record: AvatarRecord; created: boolean }>;
```

Behaviour:

1. List the caller's records and compare `sanitizeSpeciesKey(speciesName)`
   against the scanned species key.
2. **No match:** create a record with `source: 'web'`, `isTemporary: false`,
   `expiresAt: null`, `discoveredAt: now`, the canonical `spriteUrl`, the
   derived `stats`, and `speciesFamily` from the identification taxonomy.
   Return `created: true`.
3. **Match:** leave `discoveredAt` untouched, stamp `metadata.lastSeenAt = now`,
   and return `created: false`.

`metadata` is already `Record<string, unknown> | null`, so re-sighting needs no
schema change. Note that the vault's "repeated scans update `lastSeenAt`" rule
refers to a field the implemented model never had; `metadata.lastSeenAt` is how
that rule is satisfied.

### D. Deterministic battle stats

Avatar stats drive combat. `services/battle-engine.ts:220` computes
`move.power * (0.75 + attacker.stats.attack / 200) - defender.stats.defense * 0.12`,
and lines 46-53 reject a non-integer or non-positive `hp`. The NPC Thornback is
`hp 124, attack 58, defense 55, speed 46`.

Stats are derived by hashing `speciesKey` into the ranges the seeded demo
records already use. The hash must be a **pure, self-contained function** with
no randomness, no time input, and no dependency on Node's crypto — FNV-1a over
the species key, with a different offset per stat. The point is that the values
are reproducible in the report and identical across machines, so the derivation
is itself unit-tested against fixed expected values.

| Stat | Range |
|---|---|
| hp | 96 - 168 |
| attack | 41 - 72 |
| defense | 41 - 88 |
| speed | 22 - 68 |

All four are integers. The same species always yields the same stats, for every
user, on every run - which matters because records are de-duplicated per
species, and because the report needs reproducible test values.

The pipeline's own `maxHealth` and random `speed` are not used for combat. Its
`moves` are also unused: `data/battle-catalog.ts:170` resolves battle moves from
`speciesName`/`speciesFamily` independently.

### E. First-discoverer attribution

New `dex` collection, one document per species key, written on scan:

```ts
recordDiscovery(speciesKey, uid, speciesName): Promise<DexDiscovery>
```

- **Species not seen before:** create with `firstDiscoveredBy: uid`,
  `firstDiscoveredAt: now`, `discoveryCount: 1`.
- **Species already known:** increment `discoveryCount` in a transaction, leave
  the first-discoverer fields untouched.

**Where it appears:** the archive **detail** panel, and the scan result screen
immediately after a successful scan. Not the archive list — that would mean
resolving a display name for every row on every page load.

The avatar detail response gains a `discovery` block, which is a change to the
`GET /api/avatar/:avatarId` contract:

```ts
discovery: {
  firstDiscoveredByName: string;   // displayName, never the email
  firstDiscoveredAt: string;
  discoveryCount: number;
  isFirstDiscoverer: boolean;      // true when the caller found it first
} | null                           // null when the dex record is missing
```

The controller resolves `firstDiscoveredBy` to `displayName` from the `users`
collection - `repositories/auth-users.ts:49` already reads that field. **Email
addresses are never exposed.** A missing user or dex document degrades to
`null` rather than failing the detail request.

This is the first cross-user data exposure in the application; the archive has
until now been strictly owner-only. That is the intended behaviour of the
feature, and it is limited to a display name and a date.

### F. Failure handling

Storage or Firestore failures do not abort the run. The `complete` event carries:

```ts
{ finalPlant, finalSpriteB64, avatarId: string | null,
  saved: boolean, saveError?: string, discovery?: {...} }
```

The user still sees the plant they scanned; the UI can report that it was not
saved. This keeps a persistence fault visibly distinct from a generation fault.

## Testing

Following the CE10 format required for the final report - target unit, scenario,
inputs, expected outputs, and mocked pairs.

| Target unit | Scenario | Expected |
|---|---|---|
| pipeline route | bearer token that cannot be verified | 401, no generation work performed |
| SpriteStorage | first save for a species | object written once, URL returned |
| SpriteStorage | species already stored | existing URL returned, no re-upload |
| avatar repository | first scan of a species | record created, `created: true` |
| avatar repository | repeat scan, casing/punctuation drift | no duplicate, `created: false`, `discoveredAt` unchanged, `metadata.lastSeenAt` stamped |
| stats derivation | same species twice | identical stats; all integers; every value inside the documented range |
| dex repository | species never seen | `discoveryCount: 1`, first discoverer set |
| dex repository | species already known | count incremented, first discoverer unchanged |
| avatar detail | dex + user present | `discovery` block returned with `displayName`, never an email |
| avatar detail | dex or user document missing | `discovery: null`, request still succeeds |
| created record | battle eligibility | passes `isAvatarBattleEligible` |
| pipeline route | storage failure | `complete` emitted with `saved: false`, sprite still returned |

Storage and Firestore are faked at their injected boundaries; the Firestore
Emulator covers the repository transaction behaviour, consistent with the
existing archive and battle suites.

## Requirement changes this creates

Both need to reach Andrina, Omar, and Li Xiang - they change the use case
descriptions and the sequence diagrams, not only the UI:

1. **UC6 now persists**, so the operation flow gains the storage and archive
   steps and a real post-condition.
2. **First-discoverer attribution** is new user-visible behaviour on the plant
   card, and the first place one user sees another user's display name.

## Open risk

Firebase Storage client rules and the deployed integration have never been
exercised - only an Admin bucket preflight on 2026-07-21. The Admin SDK write
path used here is the one that preflight proved, so the risk sits with the
deployed configuration rather than the code. Verify on Render before the
showcase.
