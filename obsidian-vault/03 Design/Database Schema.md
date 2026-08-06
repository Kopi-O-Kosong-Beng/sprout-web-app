---
tags: [design, database, firestore, checkoff3]
source: current repositories, Sprout_Storage_IP.md, approved design 2026-07-20
---

# Database Schema

Production uses Firebase Auth plus Firestore and Firebase Storage. SQLite remains the local/test adapter. Application services depend on repository interfaces so the same behavioral contract is tested against both persistence styles.

## Identity and profile

Firebase Auth is authoritative for login credentials, ID tokens, and verified-email claim. The application `users` record stores profile/game state and reset-policy metadata.

### `users`

| Field | Type | Rule |
|---|---|---|
| `id` | string | Firebase UID, primary identity |
| `email` | string | Normalized; mirrored for application lookup |
| `displayName` | string | Trimmed 1-50 accepted characters |
| `isVerified` | boolean | Synchronized from Firebase claim |
| `passwordHash` | string/null | Application history comparison for current custom reset flow, not login authority |
| `resetOtpHash` | string/null | Bcrypt hash only |
| `resetOtpExpiresAt` | datetime/null | 15-minute TTL |
| `resetOtpFailedAttempts` | integer | Invalidate at five |
| login/logout audit fields | datetime/null | Evidence and support |
| `createdAt`, `updatedAt` | datetime | Audit |

### `password_history`

`id`, `userId`, `passwordHash`, `changedAt`. Keep only the configured recent history depth. Never store plaintext passwords or OTPs.

## Species and canonical art

### `species`

| Field | Type | Rule |
|---|---|---|
| `speciesId` | string | Stable provider taxon/species ID; primary key |
| scientific/common names | string | Display metadata, not identity key |
| taxonomy/facts/rarity | object | Versionable educational/game data |
| base stats/default moves | object | Versioned seed data |
| `canonicalSpriteAssetId` | string/null | Current approved asset reference |
| timestamps | datetime | Audit |

### `sprite_assets`

| Field | Type | Rule |
|---|---|---|
| `spriteAssetId` | string | Primary key |
| `speciesId` | string | References species |
| prompt/model/palette versions | string | Reproducible recipe |
| `recipeKey` | string unique | Species plus all recipe versions |
| `status` | enum | `GENERATING`, `COMPLETED`, `FAILED` |
| lock owner/expiry | string/datetime | Concurrent generation control |
| `objectPath` | string/null | Set only for completed asset |
| `checksum` | string/null | Integrity/deduplication |
| provider/error metadata | object | Sanitized; no credentials/raw sensitive payload |
| timestamps | datetime | Audit |

## User collection and scans

### `user_species_collection`

| Field | Type | Rule |
|---|---|---|
| `id` | string | Primary key |
| `userId`, `speciesId` | string | Composite unique pair |
| `status` | enum | `VISITED` or `CAUGHT`; promote only |
| `nickname` | string/null | User personalization |
| `sourcePhotoPath` | string/null | Private object path |
| `firstSeenAt`, `lastSeenAt` | datetime | Preserve first, update last |
| `pveXp` | integer | Default 0 |
| `pveWins`, `pveLosses` | integer | Default 0 |
| `currentWinStreak`, `bestWinStreak` | integer | Default 0 |

### `scan_events`

`scanId`, `userId`, upload hash, provider, confidence, species ID, outcome/stable error, optional private photo path, and timestamp. Scan history may grow; collection rows remain one per user/species.

## PVE

### `battle_sessions`

`sessionId`, `userId`, selected collection ID, NPC preset/version, RNG seed, turn number, state, HP snapshot, result, reward-applied marker, timestamps, and version/optimistic-lock field.

### `battle_actions`

`actionId`, `sessionId`, turn number, actor, move ID, RNG result, damage/heal/effect, before/after state summary, and timestamp. Unique `(sessionId, turnNumber, actor)` prevents duplicate application.

## Query tickets

### `query_tickets`

`id`, unique `refNumber`, name, email, category, message, status, submitter-email status, admin-email status, sanitized last email error, attempt timestamps, and created/updated timestamps.

The daily reference counter is atomic. Ticket persistence commits before notification attempts.

## Object storage paths

```text
canonical-sprites/{speciesId}/{recipeHash}.png
users/{userId}/plant-photos/{scanId}.{ext}
```

Firestore/SQLite stores paths and metadata, never image blobs/base64. Canonical paths are shared and immutable; user-photo paths are private.

## Migration from current records

Current `avatar_records` can be treated as legacy import data. Migration resolves a stable species ID, creates/links a `species` and `sprite_asset`, then upserts one `user_species_collection` row. Legacy source determines `VISITED`/`CAUGHT` only when provenance is trustworthy; uncertain records default to `VISITED`.

## Related

[[Domain Model]] · [[System Architecture]] · [[QA Sprite Storage and Web Cache]] · [[UC6 Upload Plant Picture]]
