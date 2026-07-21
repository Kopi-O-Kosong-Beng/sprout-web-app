# Archive/PVE Task 6 Report

## Outcome

Implemented the pure deterministic PVE battle engine described by Task 6. The
change is limited to battle types, the versioned move/NPC catalog, the seeded
RNG, the pure engine, and focused mechanics/property tests. No Firestore
persistence, routes, controllers, services that perform I/O, or client code was
changed.

Implementation commit:
`3cca01fc45a14a0f06e49beebba615706d38349b`

Author: `Zhi Feng <zhifeng_chia@mymail.sutd.edu.sg>`

## Node 22 Setup

All npm commands used the requested runtime:

```powershell
$node = 'C:\Users\zhife\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\bin\node.exe'
$npm = 'D:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js'
$env:PATH = "$(Split-Path -Parent $node);$env:PATH"
```

## RED Evidence

The mechanics and property tests were created before production files.

```powershell
& $node $npm exec -w server -- firebase emulators:exec --project sprout-test --only firestore 'jest --runInBand --runTestsByPath tests/battle-engine.test.ts tests/battle-engine.property.test.ts'
```

Result: exit code 1. Both suites failed to compile with `TS2307` for the missing
`services/battle-engine`, `services/seeded-rng`, and `models/battle` modules.
This was the expected RED cause; no battle tests ran.

A later contract review identified that accuracy should be persisted as a
display-ready percentage. The focused test was changed from `1` to `100` before
the production correction:

```powershell
& $node $npm exec -w server -- jest --runInBand --runTestsByPath tests/battle-engine.test.ts -t 'creates a versioned session'
```

Result: exit code 1, with expected accuracy `100` and received accuracy `1`.

## GREEN Evidence

Focused tests through the requested emulator command:

```powershell
& $node $npm exec -w server -- firebase emulators:exec --project sprout-test --only firestore 'jest --runInBand --runTestsByPath tests/battle-engine.test.ts tests/battle-engine.property.test.ts'
```

Result: 2 suites passed, 21 tests passed. The property suite executes 1,000
generated cases covering HP bounds, Sun bounds, stable active phases, and
exclusive terminal outcomes.

Full server tests through the existing guarded emulator wrapper:

```powershell
& $node $npm test -w server
```

Result: 17 suites passed, 146 tests passed. Firebase emitted only its expected
local unauthenticated warning; the test script exited 0 and the wrapper shut
the emulator down.

Static and build checks:

```powershell
& $node $npm run typecheck -w server
& $node $npm run build -w server
git diff --cached --check
```

Result: all commands exited 0. The build ran `clean` and `tsc`; generated
`dist/` output remains ignored. The staged implementation diff contained only
the six Task 6 source/test files.

Port cleanup was performed through the repository's guarded
`cleanupFirestoreEmulator` helper after direct emulator runs. Final
`Get-NetTCPConnection -LocalPort 8080 -State Listen` inspection returned no
owner; port 8080 was free.

## Changed Files

- `server/models/battle.ts`: versioned session, phase, intent, participant,
  event, input, and progression types.
- `server/data/battle-catalog.ts`: `v1` four-action catalog, species-over-family
  resolution with fallback, and fixed `thornback-v1` snapshot.
- `server/services/seeded-rng.ts`: unsigned 32-bit LCG.
- `server/services/battle-engine.ts`: pure creation, intent preparation, round
  resolution, abandonment, damage, and progression functions.
- `server/tests/battle-engine.test.ts`: deterministic mechanics, validation,
  ordering, state transition, progression, and immutability tests.
- `server/tests/battle-engine.property.test.ts`: 1,000-run fast-check invariant
  suite.

## Design Judgments

- Accuracy is stored as an integer percentage (`100`, `85` through `90`) so the
  future UI can display it directly. Accuracy rolls use `rngValue * 100`.
- Move selection checks an exact normalized species first, then normalized
  family, then the documented generic `Leaf Tap`/`Wild Growth` fallback.
- Thornback is fixed at 124 HP, 58 Attack, 55 Defense, and 46 Speed with a
  complete four-action snapshot.
- Bot Quick intent is `charging`, Signature is `attacking`, Guard is
  `guarding`, and Photosynthesis is `recovering`. Intent log text does not name
  the pending move.
- A damaged bot may select Heal once at normal weight. Below 40 percent HP,
  Heal receives three total entries in the weighted choice but is not
  guaranteed. Full-health and already-used Heal plus unaffordable Signature are
  filtered out.
- Guard mitigation is determined from both selected actions before speed
  ordering, so it covers the whole round. Guard remains an ordered action and
  grants Sun only if its participant survives long enough to act. This keeps
  the faint-skips-second-action rule meaningful for resource changes.
- Non-Guard actions resolve by Speed and the player wins ties. A fainted second
  actor receives a structured `player_action_skipped` or `bot_action_skipped`
  event and performs no action.
- Pure transitions do not read the wall clock. `createBattle` receives `now`;
  terminal transitions copy the session's deterministic `updatedAt` to
  `completedAt`. The persistence transaction should provide authoritative write
  timestamps when Task 7 is implemented.
- Terminal Win/Loss sets the computed `xpAwarded` (`20`/`5`) while preserving
  `rewardApplied=false`. `calculateProgression` separately returns XP,
  win/loss, and streak instructions for Task 7 to apply atomically. Abandon
  awards nothing.

## Handoff Notes

The action-order judgment above is the only material interpretation not stated
word-for-word in the design: Guard protects the full round, but its Sun gain is
skipped if the guarder faints before acting.

`pendingBotMoveId` must remain in the persisted server snapshot for replay, but
Task 8 should omit it from player-facing serialization and expose only
`botIntent`. Task 7 should set `rewardApplied=true` only inside the same
Firestore transaction that changes user progression; the pure engine never
marks rewards applied.
