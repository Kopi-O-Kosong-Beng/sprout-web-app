---
tags: [qa, decision, database, checkoff3]
question-from: team chat
updated: 2026-07-20
---

# Q&A - What belongs in the Sprout database?

The original proposal `email, username, perm_sprite, web_sprite` is too small and puts collection data in the wrong place. A user owns many species records, while canonical art is shared across users.

## Three-layer model

1. **Account/profile:** Firebase UID plus Sprout display, verification mirror, reset-policy metadata, and game totals.
2. **Species catalogue/canonical art:** stable species identity, educational/game metadata, and versioned sprite assets.
3. **Per-user collection:** one `(userId, speciesId)` record with provenance, nickname, dates, private photo, and PVE progression.

Supporting records are `ScanEvent`, `BattleSession`/`BattleAction`, `QueryTicket`, and password history. Full fields are in [[Database Schema]].

## Why sprites are not user columns

- A collection is one-to-many, not one `perm_sprite` and one `web_sprite`.
- Canonical art is shared and deduplicated by species/recipe.
- Personal provenance belongs on the user/species relationship.
- The archive needs pagination, ownership checks, dates, XP, and details.
- Images belong in object storage; the database stores paths and checksums.

## Provenance decision

- Web upload: create/update persistent `VISITED`.
- Trusted mobile encounter: create `CAUGHT` or promote `VISITED` to `CAUGHT`.
- Never demote.
- Treat status as a trust signal, not absolute proof.

## Auth note

Firebase Auth owns login credentials and tokens. Sprout still stores a profile by Firebase UID and the password/OTP metadata required by the team's custom UC3 reset flow. These application hashes are not used to authenticate normal login.

## Related

[[Database Schema]] · [[Domain Model]] · [[QA Sprite Storage and Web Cache]] · [[UC6 Upload Plant Picture]]
