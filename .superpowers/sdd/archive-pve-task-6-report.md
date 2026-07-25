# Archive/PVE Task 6 Report

## Outcome

Implemented the pure deterministic PVE battle engine described by Task 6, then
applied the independent-review fixes for intent privacy, transition timestamps,
and meaningful terminal property coverage. The change remains limited to the
battle model, pure engine, focused tests, and this report. No Task 7 Firestore
repository, transaction, decoder, route, controller, or other I/O was added.

Original implementation commit:
`3cca01fc45a14a0f06e49beebba615706d38349b`

Original report commit:
`aa48c58eb0663c8e0f42ce6271d70626536dfda7`

First independent-review fix:
`58eda309f5554bf677426bc8eee36e48e9f6b4ad`

Current-legal-set intent fix: this report's commit.

Author: `Zhi Feng <zhifeng_chia@mymail.sutd.edu.sg>`

## Node 22 Setup

All npm commands used the requested runtime:

```powershell
$node = 'C:\Users\zhife\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\bin\node.exe'
$npm = 'D:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js'
$env:PATH = "$(Split-Path -Parent $node);$env:PATH"
```

Final runtime check returned `v22.23.1`.

## RED Evidence

The original mechanics and property tests were created before production files.
Their first emulator run exited 1 with `TS2307` for the missing battle engine,
RNG, and model modules. A later display-accuracy contract test failed with
expected `100` and received `1` before the catalog correction.

Independent-review tests were also observed failing before their production
changes:

- Intent privacy: the deterministic all-actions test failed because the
  serialized public event contained the exact `guard` ID in both `guarding` and
  `guarded stance`. The old four categories also mapped one-to-one to moves.
- Current legal-set ambiguity: five deterministic state tests calculated legal
  candidates before sampling emitted intents. The static `offensive | defensive`
  mapping failed all five expected dynamic partitions; its cardinality was one
  in the initial, full-energy/full-HP, damaged/0-Sun, and heal-used/full-energy
  states.
- Transition API: active, win, loss, and abandonment timestamp tests failed to
  compile with `TS2554` because `resolvePlayerAction` and `abandonBattle` did not
  accept the required `{ transitionAt }` input.
- Idempotent abandonment validation: a malformed timestamp did not throw because
  the early return bypassed validation.

Each focused failure was followed by its minimal implementation and a passing
rerun before moving to the next behavior.

## Review Fixes

- Replaced the catalog-wide static mapping with the dynamic public
  `building | committed | uncertain` contract. Intent grouping is computed from
  the unique legal candidates for the current bot state without consuming an
  additional RNG value.
- Quick and Guard emit `building` when they are the only legal pair. Signature
  and Heal emit `committed` only when both are currently legal alongside the two
  setup moves. If exactly one high-commitment move is legal, every current
  candidate emits `uncertain`, preventing that move or either setup action from
  becoming identifiable.
- Intent events use neutral category text and carry no move ID. Five state tests
  cover initial 0-Sun/full-HP, full-energy/full-HP, damaged/0-Sun,
  damaged/full-energy, and heal-used/full-energy candidates. They observe every
  legal move across deterministic seeds, require at least two moves per emitted
  category, and reject every exact bot move ID or name in the serialized event.
- Added the required `BattleTransitionInput { transitionAt: string }` argument to
  `resolvePlayerAction` and `abandonBattle`. The engine accepts only canonical ISO
  instants strictly later than the session's current `updatedAt`.
- Every accepted player action updates `updatedAt`. Active rounds retain
  `completedAt=null`; wins, losses, and abandonment set both timestamps to the
  supplied transition instant. Idempotent abandonment also validates its input
  while returning the same immutable terminal snapshot.
- Strengthened the 1,000-run property test. Generated legal action sequences
  retain HP/Sun bounds and transition timestamps, and every generated run then
  exercises win, loss, and abandonment. Win requires bot HP zero with the player
  alive, loss requires player HP zero, and each terminal status requires exactly
  its own terminal event.

## GREEN Evidence

Focused tests through the requested Firestore emulator command:

```powershell
& $node $npm exec -w server -- firebase emulators:exec --project sprout-test --only firestore 'jest --runInBand --runTestsByPath tests/battle-engine.test.ts tests/battle-engine.property.test.ts'
```

Result: 2 suites passed, 27 tests passed. The property suite executes 1,000
generated runs and forces all three meaningful terminal outcomes in every run.

Full server tests through the guarded emulator wrapper:

```powershell
& $node $npm test -w server
```

Result: 17 suites passed, 152 tests passed. The wrapper exited 0, performed its
identity-checked cleanup, and left port 8080 free. Firebase emitted only the
expected local unauthenticated warning.

The first full-suite attempt had two unrelated five-second timeouts in
`auth.test.ts` while Task 6 and the other 16 suites passed. The auth suite then
passed all 37 tests in isolation, including those two cases, and the prior full
guarded rerun produced 148/148. No auth code or timeout was changed. The latest
current-legal-set review run produced the fresh 152/152 result above.
changed.

Static and build checks under Node 22.23.1:

```powershell
& $node $npm run typecheck -w server
& $node $npm run build -w server
git diff --check
```

Result: typecheck and build exited 0; the build ran `clean` and `tsc`. Generated
`dist/` output remains ignored. Diff checks reported no whitespace errors.

The direct focused emulator command left its known Java emulator owner on port
8080. The repository's `cleanupFirestoreEmulator` helper verified the exact Java
executable, versioned emulator JAR, and `sprout-test` project before termination.
Final inspection under Node 22.23.1 returned `PORT_8080_FREE`.

## Changed Files

- `server/models/battle.ts`: dynamic player-facing intent union and named
  transition-time input contract.
- `server/services/battle-engine.ts`: current-legal-set intent partitioning,
  neutral intent emission, and explicit validated transition timestamps.
- `server/tests/battle-engine.test.ts`: five-state legal-candidate intent
  privacy/cardinality tests plus retained timestamp and mechanics coverage.
- `server/tests/battle-engine.property.test.ts`: 1,000-run bounded random rounds
  plus outcome-specific terminal invariants.
- `.superpowers/sdd/archive-pve-task-6-report.md`: independent-review evidence and
  handoff notes.

## Preserved Design Judgments

- Accuracy is stored as an integer percentage (`100`, `85` through `90`), and
  accuracy rolls use `rngValue * 100`.
- Move selection checks normalized species, then normalized family, then the
  documented generic `Leaf Tap`/`Wild Growth` fallback.
- Thornback remains fixed at 124 HP, 58 Attack, 55 Defense, and 46 Speed with a
  complete four-action snapshot.
- A damaged bot may select Heal once at normal weight. Below 40 percent HP, Heal
  receives three weighted entries but is not guaranteed.
- Guard protects the full round, while its Sun gain is skipped if the guarder
  faints before acting. Non-Guard actions resolve by Speed; the player wins ties,
  and a faint skips the second action.
- Win/Loss sets computed `xpAwarded` (`20`/`5`) while preserving
  `rewardApplied=false`. Abandonment awards nothing.

## Task 7 Handoff

Task 7 transactions must create the authoritative canonical ISO transition
instant and pass it explicitly as `{ transitionAt }` to the pure engine. They
must not overwrite engine timestamps afterward with a different clock value.

Do not silently trust persisted battle-session objects. Task 7's Firestore
decoder must validate the complete rehydrated session before calling Task 6,
including status/phase/intent enums, version tags, canonical timestamps and
ordering, participant HP/Sun/heal bounds, move snapshots, RNG fields, pending
move consistency, and terminal-state consistency. That decoder work is
deliberately deferred; it was not implemented as part of Task 6.

`pendingBotMoveId` must remain in the persisted server snapshot for deterministic
replay, but the later player-facing serializer must omit it and expose only
`botIntent`. Task 7 must set `rewardApplied=true` only in the same Firestore
transaction that applies progression; the pure engine never marks rewards
applied.
