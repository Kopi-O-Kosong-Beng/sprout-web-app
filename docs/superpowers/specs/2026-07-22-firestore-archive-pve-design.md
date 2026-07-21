# Firestore-Only Archive and PVE Design

**Date:** 2026-07-22
**Owner:** Zhi Feng
**Status:** Approved for implementation planning

## Context

The current Archive and PVE pages are static previews backed by a five-item
frontend array. The real avatar read API exists, but Archive does not call it.
PVE has no backend routes or service, so its action buttons cannot change battle
state.

The backend also retains a SQLite fallback even though Firebase is now the
project platform. A live audit before this design recorded:

- Firebase Authentication: 11 users.
- Firestore: 4 user profiles, 5 avatar records, 3 query tickets, 0 battles.
- Local SQLite test database: 4 user profiles, 5 avatar records, 0 query
  tickets, 0 battles.
- Two active Firebase users have SQLite profiles but no Firestore profile.
- One SQLite-only profile no longer has a Firebase Authentication identity.

Removing SQLite before reconciling those records would lose active application
profiles. The migration therefore precedes dependency and file removal.

## Goals

1. Make Firebase Authentication, Firestore, and Cloud Storage the only runtime
   persistence platform.
2. Remove SQLite, Knex, datastore selectors, SQL migrations, SQL scripts, SQL
   tests, and `DATASTORE`/`DB_FILENAME` configuration.
3. Make Archive show only records owned by the authenticated user.
4. Provide an environment-gated control that adds and removes five demo avatars
   without affecting collected plants.
5. Implement a server-authoritative, persisted, alternating-turn PVE battle.
6. Preserve deterministic retries, reproducible RNG, and one-time rewards.
7. Produce unit, integration, component, system, and diagram evidence suitable
   for Checkoff 3.

## Non-Goals

- PVP, matchmaking, public leaderboards, seasons, and trading.
- Multiple active plants or switching during PVE.
- Poison, paralysis, weather, and other lasting status effects.
- XP-based combat-stat growth in this increment.
- The real plant-identification and sprite-generation upload pipeline.
- Client-side direct access to Cloud Storage; deny-all client rules remain.

## Data Migration and SQLite Removal

### Migration policy

A one-time script will compare local profile IDs with Firebase Authentication
and Firestore before changing runtime code.

- Copy a local profile only when the same UID still exists in Firebase
  Authentication and the Firestore profile document does not already exist.
- Preserve email, display name, verification state, password-history baseline,
  and login/logout audit fields.
- Clear reset OTP hash, expiry, and failed-attempt state during migration so no
  credential-recovery secret crosses environments.
- Never overwrite an existing Firestore profile.
- Discard a local profile when its Firebase Authentication identity no longer
  exists.
- Compare legacy local avatars with Firestore using a canonical fingerprint of
  species, family, source, temporary status, and stats. The legacy seed created
  random IDs and timestamps independently, so IDs are not expected to match.
  Abort instead of deleting local data if any local avatar lacks an equivalent
  Firestore fingerprint or belongs to a non-demo user.
- Existing Firestore tickets and avatars remain authoritative.
- Produce a dry-run summary before an explicit apply run.

### Removal scope

After migration verification:

- Import Firestore repositories directly; remove the `DATASTORE` selectors.
- Remove SQLite repository implementations and SQLite repository tests.
- Remove `server/database/db.ts`, Knex configuration, SQL migrate/rollback/seed
  entry points, SQL migration files, and local database files.
- Remove `knex` and `better-sqlite3` dependencies and their lockfile entries.
- Remove `migrate`, `migrate:rollback`, and SQLite `seed` scripts.
- Keep a Firestore seed command, an Auth-profile reconciliation command, and a
  Firestore inspection command that reports safe counts by default.
- Replace SQLite integration tests with Firebase Emulator integration tests.
- Automated tests must never write to the production Firebase project.

## Firestore Collections

### `users/{uid}`

Existing profile and reset fields remain. Add:

- `pveXp: number`, default `0`.
- `pveWins: number`, default `0`.
- `pveLosses: number`, default `0`.
- `currentPveWinStreak: number`, default `0`.
- `bestPveWinStreak: number`, default `0`.

### `avatar_records/{avatarId}`

Existing ownership, species, sprite, collection status, and stat fields remain.
Demo records additionally contain:

```json
{
  "metadata": {
    "isDemo": true,
    "demoSetVersion": "checkoff3-v1",
    "demoTemplateId": "stable-template-id"
  }
}
```

Demo document IDs are deterministic per user and template. Re-enabling the
same set updates or preserves those five records rather than duplicating them.

### `battle_sessions/{sessionId}`

Each session stores an immutable snapshot needed to replay and audit it:

- Owner UID and selected avatar ID.
- Player avatar identity, sprite, stats, and resolved move set.
- Versioned NPC identity, sprite, stats, and resolved move set.
- Player and bot current/max HP.
- Player and bot Sun energy.
- Player and bot heal-used flags.
- Current turn number and state.
- Pending bot move and public intent category.
- RNG seed and RNG step.
- Move-catalog version and NPC-preset version.
- Structured battle-log events.
- Terminal outcome, XP awarded, and reward-applied marker.
- Created, updated, and completed timestamps.

## Environment-Gated Demo Tools

The frontend control appears only when
`VITE_ENABLE_DEMO_TOOLS=true`. The server independently requires
`ENABLE_DEMO_TOOLS=true`; otherwise demo mutation routes return 404.

Authenticated endpoints:

- `POST /api/avatar/demo` idempotently creates the five demo records for the
  caller and returns the refreshed archive.
- `DELETE /api/avatar/demo` deletes only deterministic demo documents owned by
  the caller whose metadata matches `checkoff3-v1`.

Turning the set off cannot delete a collected plant. The frontend always loads
the real archive API, so a new account shows an empty state until it collects a
plant or enables the demo set.

## Recommended PVE Experience

The battle is a short 1v1 encounter targeted at four to seven rounds. It uses
plant-specific move names rather than generic Attack/Special/Defend labels.

### Actions

- **Quick move:** reliable lower damage and `+1` Sun energy.
- **Guard move:** reduces incoming damage by 50 percent for that round and
  grants `+1` Sun energy.
- **Signature move:** stronger plant-themed damage, costs `2` Sun energy, and
  has visibly lower accuracy than the quick move.
- **Photosynthesis:** restores 25 percent of maximum HP, can be used once per
  battle, and consumes the action.

The move catalog is versioned in server code. A deterministic species/family
mapping selects move names and profiles, with a documented fallback when
taxonomy is missing. The full move snapshot is stored in each session so a
catalog update cannot change an existing battle.

### Damage and accuracy

For a damaging move:

```text
rawDamage = round(power * (0.75 + attacker.attack / 200)
                  - defender.defense * 0.12)
damage = max(5, rawDamage)
```

Guard halves damage after the minimum is applied. HP is floored at zero. Quick
moves use 100 percent accuracy. Signature accuracy is part of its versioned
move definition and is never lower than 85 percent in `v1`.

### Bot behavior and intent

The bot chooses from currently valid moves using stored seeded RNG. It cannot
heal at full HP, heal more than once, or use a signature without enough Sun.
When below 40 percent HP, Heal receives additional selection weight but is not
guaranteed.

The server chooses the next bot action before returning `PLAYER_ACTION` and
reveals only an intent category such as attacking, guarding, charging, or
recovering. This makes Guard an informed choice while retaining RNG-driven bot
behavior.

### Round resolution

1. Server has already persisted the bot's pending move and public intent.
2. Player submits a valid move and expected turn number.
3. Guard applies to incoming damage for the round regardless of speed.
4. Remaining actions execute in speed order; the player wins speed ties.
5. If the first damaging action causes a faint, the second action is skipped.
6. Server checks the outcome, applies a reward once, or prepares the next bot
   intent and increments the turn.

The externally stable waiting state is `PLAYER_ACTION`; the server enters the
other states inside a start/action transaction and returns after it has either
prepared the next intent or reached a terminal outcome:

```text
SELECT_AVATAR -> PREPARE_BOT_INTENT -> PLAYER_ACTION -> RESOLVE_ROUND
                        ^                                  |
                        |                                  v
                        |--------------------------- CHECK_RESULT
                                                            +-> WON
                                                            +-> LOST
PLAYER_ACTION ------------------------------------------> ABANDONED
```

## Rewards

- Win: `+20` PVE XP, `+1` win, increment current streak, and update best streak.
- Loss: `+5` PVE XP, `+1` loss, and reset current streak.
- Abandon: no XP and no win/loss increment.

Battle HP and consumables are session-only. A public leaderboard remains
deferred because unrestricted battle XP is farmable.

## API Contract

All routes require a verified Firebase ID token.

- `POST /api/battle/pve/start` with `{ avatarId }` creates a session only when
  the caller owns the avatar.
- `GET /api/battle/pve/:sessionId` returns only a caller-owned session.
- `POST /api/battle/pve/:sessionId/action` with
  `{ moveId, expectedTurn }` resolves one complete round.
- `POST /api/battle/pve/:sessionId/abandon` marks an active caller-owned
  session abandoned without reward.

An action transaction reads the session, verifies owner/state/turn/move,
resolves the round, and writes the session. If the round becomes terminal, the
same transaction updates the user reward fields and sets `rewardApplied=true`.

A duplicate request with an older expected turn returns the current state with
`stale=true` and applies no action. A future turn, invalid move, foreign
session, or terminal-session action is rejected without mutation. Battle
actions receive a dedicated per-user rate limit.

## Frontend Behavior

### Archive

- Fetch authenticated records from `GET /api/avatar`.
- Render loading, retryable error, empty, populated, and demo-mutating states.
- Keep collected and demo records visually distinguishable.
- Toggle copy states exactly what will happen: add five demo plants or remove
  demo plants.
- Preserve real collected records when demo mode is disabled.

### PVE

- Fetch owned eligible avatars rather than importing showcase data.
- Empty users are directed back to Archive or the future collection flow.
- Starting a match creates the backend session before showing the arena.
- Render HP, Sun energy, bot intent, move power/accuracy/cost, heal availability,
  and structured turn log from server state.
- Disable controls while a request is pending and while the session is
  terminal.
- Render victory, defeat, XP, replay, abandon, and change-avatar paths.
- Never calculate authoritative damage or reward state in the browser.

## Error Handling and Security

- Repository and Firebase errors pass through the existing controlled API error
  boundary; secrets and raw provider responses are not shown to users.
- Ownership is checked for avatar, demo records, and battle sessions.
- Demo mutation requires both authentication and the server environment flag.
- Firestore transactions prevent duplicate turns and duplicate rewards.
- Session snapshots prevent later avatar or move edits from changing an active
  battle.
- Production Storage remains backend-only under deny-all client rules.

## Testing Strategy

### Unit tests

- Pure seeded RNG sequence and valid bot-action selection.
- Damage, accuracy, Guard, energy, Heal, speed order, faint handling, and HP
  bounds.
- State transitions, stale turns, terminal sessions, and reward calculations.
- Property tests for non-negative HP, bounded energy, and exactly one terminal
  outcome.

### Repository and integration tests

- Firebase Emulator, never production, covers profile migration, demo upsert and
  removal, battle creation, ownership, round transaction, stale retry,
  abandonment, and one-time reward application.
- Supertest covers authentication, validation, rate limits, controlled errors,
  and full start/action/get/abandon flows against emulator-backed repositories.

### Frontend tests

- Archive loading, empty, error, real data, demo enable, demo disable, and
  collected-data preservation.
- PVE empty roster, selection, start, move submission, pending-state lock,
  intent display, stale response, battle log, victory, defeat, and abandon.

### System evidence

- A verified new account sees an empty archive.
- Demo toggle adds exactly five records and removes exactly those five.
- One complete PVE match persists alternating states and one reward.
- A replayed action request cannot duplicate damage or XP.
- Firestore Console evidence shows user-owned avatar and battle documents with
  secrets and personal data redacted.

## Rollout Order

1. Add and dry-run the profile reconciliation script.
2. Apply migration and verify active Firebase users have Firestore profiles.
3. Introduce Firebase Emulator test infrastructure.
4. Make Firestore repositories the only runtime repositories.
5. Remove SQLite code, scripts, dependencies, files, and configuration.
6. Implement and test environment-gated demo avatar writes.
7. Connect Archive to the real API and empty state.
8. Implement the pure battle engine and Firestore battle repository.
9. Add battle APIs, rate limits, and full integration tests.
10. Connect and test the PVE interface.
11. Run typecheck, lint, build, complete tests, emulator tests, and browser smoke
    tests.
12. Synchronize API, database, MVC/BCE, sequence, state-machine, test-plan, and
    Obsidian documentation.

## Acceptance Criteria

- No runtime or test dependency references SQLite, Knex, or a datastore switch.
- Two active local-only profiles are present in Firestore before local deletion;
  orphaned identities are not migrated.
- A new verified account has zero avatars by default.
- Demo mode adds and removes exactly five caller-owned demo avatars.
- Collected avatars survive demo removal.
- PVE actions modify server-persisted state and follow the documented state
  machine.
- Duplicate/stale action requests do not duplicate damage or rewards.
- Win, loss, and abandon outcomes persist the documented progression result.
- All automated tests pass without contacting production Firestore.
- Local browser testing demonstrates Archive and one complete PVE match.
