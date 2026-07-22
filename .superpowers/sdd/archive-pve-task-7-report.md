# Archive/PVE Task 7 Report

## Outcome

Implemented Firestore battle persistence, strict runtime battle-document
decoding, transactional round resolution, and exactly-once PVE progression.
The repository supplies Task 6's explicit `transitionAt` input from an
injectable clock and never passes unchecked Firestore data into the pure battle
engine.

Implementation commit:
`da5c0dd346ecfa0c4f2c22d0575c0236702d6555`

Author and committer:
`Zhi Feng <zhifeng_chia@mymail.sutd.edu.sg>`

## TDD Evidence

### RED

The first focused emulator run was made after creating only
`server/tests/battle-repository.test.ts`. It exited 1 because
`repositories/battles.ts` did not exist and the five PVE progression fields did
not yet exist on `AuthUserProfile`.

A second decoder-hardening RED cycle added five invariant cases after the first
GREEN implementation. The focused suite then failed exactly those cases:

- catalog-v1 Quick power;
- catalog-v1 Signature accuracy;
- RNG state trajectory from seed and step;
- unpaired move-outcome events;
- an outcome that was illegal for the selected move kind.

The active-round concurrent duplicate test added in the same cycle already
passed, confirming that one transaction advanced the round and the retry
returned the stored stale snapshot.

### GREEN

Focused emulator command under Node 22.23.1:

```powershell
& $node $npm exec -w server -- firebase emulators:exec --project sprout-test --only firestore "jest --runInBand --runTestsByPath tests/battle-repository.test.ts"
```

Final result: 1 suite passed, 61 tests passed. This includes ownership, stale
and future turns, deterministic timestamps, round persistence, concurrent
active duplicates, concurrent terminal rewards for wins and losses, missing
profiles, abandon idempotency, terminal rejection, legacy profile defaults,
new-profile defaults, Firestore timestamp normalization, and 44 malformed
document/invariant cases.

Full guarded server command under Node 22.23.1:

```powershell
& $node $npm test -w server
```

Final result: 18 suites passed, 213 tests passed. The guarded runner performed
its emulator shutdown and left port 8080 free.

The first broadened run had one unrelated five-second timeout in the existing
concurrent wrong-OTP auth test while Task 7 passed. The exact auth case passed
unchanged in isolation, and both subsequent full guarded runs passed. No auth
code or timeout was changed.

Static verification under Node 22.23.1:

```powershell
& $node $npm run typecheck -w server
& $node $npm run build -w server
git diff --cached --check
```

Typecheck and build exited 0. The build ran the guarded clean step followed by
TypeScript compilation. The staged diff check reported no whitespace errors,
the staged content contained no prohibited attribution metadata, and the final
port check returned `PORT_8080_FREE`.

## Decisions

- `createBattleRepository({ clock })` accepts a `() => Date` clock. Exact-turn
  actions and first-time abandonment use one canonical ISO instant; when the
  clock is equal to or older than the stored `updatedAt`, the repository uses
  the next millisecond required by Task 6. Stale actions and repeated
  abandonment do not call the clock or alter timestamps.
- `decodeBattleSession` is the Firestore trust boundary. It validates path and
  embedded IDs, owner and avatar relationships, enums, version tags, canonical
  timestamp ordering, participant snapshots, HP/Sun/heal bounds, catalog-v1
  moves, pending-move legality, bot intent, stable phase/status combinations,
  log actors/types/turns/outcome sequencing, RNG count and trajectory, terminal
  HP, and reward consistency.
- Decoder failures become `BattleRepositoryError` with code
  `invalid_battle_document` and status 500. Ownership is hidden behind the same
  404 used for missing sessions. Future turns and terminal actions are 409s;
  malformed expected turns and invalid moves are controlled 400s.
- One Firestore transaction reads the battle, resolves an exact turn, reads the
  profile only for a win or loss, updates all five progression fields, marks
  `rewardApplied=true`, and writes the terminal session. Firestore retries make
  concurrent duplicate rewards exactly once.
- Persisted wins and losses must have their reward marker set because session
  and profile are atomic. Abandonment remains reward-free and idempotent.
- Missing legacy progression fields normalize to zero. Present malformed,
  negative, fractional, or unsafe progression values are rejected instead of
  silently normalized.

## Changed Files

- `server/models/auth.ts`: non-optional PVE progression fields.
- `server/repositories/auth-users.ts`: legacy zero normalization, strict
  progression validation, and new-profile defaults.
- `server/repositories/battles.ts`: repository interfaces, controlled errors,
  complete decoder/invariants, injectable clock, transactions, stale handling,
  abandonment, and exactly-once rewards.
- `server/tests/battle-repository.test.ts`: 61 focused emulator tests.
- `server/tests/firestore-test-utils.ts`: partial-profile seeding for intentional
  legacy fixtures while production profile typing remains strict.

## Handoff Notes

- Task 8 should map `BattleRepositoryError` codes at its service boundary and
  continue returning 404 for missing or foreign sessions.
- The player-facing serializer must omit `pendingBotMoveId`; it remains in the
  validated server snapshot for deterministic resolution.
- Direct `firebase emulators:exec` runs can leave their Java emulator owner on
  port 8080 after Jest exits. The repository's identity-checked cleanup helper
  was used after focused runs; the guarded full-suite runner cleaned it on the
  final run.
