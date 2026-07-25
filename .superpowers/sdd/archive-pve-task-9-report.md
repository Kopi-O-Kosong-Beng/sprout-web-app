# Archive/PVE Task 9 Report: Server-Driven PVE Client

**Date:** 2026-07-23
**Branch:** `feat/checkoff3-auth-email`
**Status:** Complete
**Implementation commit:** `7aa3bc8dad151a7dfb36ba7460018b2d09f43fcb`
**Subject:** `feat: connect PVE interface to battle APIs`
**Author and committer:** `Zhi Feng <zhifeng_chia@mymail.sutd.edu.sg>`

## Scope

- Mirrored the Task 8 public PVE session, participant, move, intent, event, and
  stale-action shapes in the authenticated client API without internal RNG,
  pending bot move, catalog-version, ownership, or reward-application fields.
- Added start, GET, action, and abandon API helpers. Action POSTs exactly
  `{ moveId, expectedTurn }` and consumes the response's authoritative session.
- Replaced the transitional timer/static Battle preview with explicit roster
  loading, load error, empty, selecting, starting, active, submitting, command
  error, terminal, and retry states.
- Loaded every owned-avatar page defensively, trusted only a route `avatarId`
  present in that roster, and ignored route avatar presentation/combat data.
- Rendered bounded current/max HP, bounded Sun `0..2`, broad bot intent, every
  public move field, accessible disabled reasons, ordered public events, server
  outcomes, XP, replay, abandon, and change-plant commands.
- Added server-sprite support for the bot and a semantic bounded HP progressbar.

## RED Evidence

All commands used Node `v22.23.1` from the existing downloaded Node 22 runtime.

The first focused run followed the 20-test Battle matrix and preceded all Task
9 production edits:

```powershell
npm test -w client -- --run src/pages/BattlePage.test.tsx
```

Result: 1 file failed, 20 tests failed. The failures consistently rendered the
old `No plant selected` transitional page, proving roster pagination, API start
and action flows, retries, server fields, logs, and terminal commands were not
implemented.

A review-driven second RED added same-route stale-request coverage. The focused
run reported 1 failure and 20 passes because invalidating the first roster load
left the synchronous in-flight latch closed, preventing the newer route-state
load from starting.

## GREEN Evidence

Final focused command:

```powershell
npm test -w client -- --run src/pages/BattlePage.test.tsx
```

Result: PASS, 1 file and 21 tests. Coverage includes:

- direct/no-state and multi-page roster loading;
- valid and invalid route-ID selection without trusting route avatar data;
- empty roster, load retry, unmount cancellation, and newer-route stale safety;
- persisted start and start retry;
- bounded HP/Sun, intent, complete move fields, and no transitional static data;
- insufficient-Sun, consumed-Heal, and full-HP disabled reasons;
- synchronous double-click protection and all-command pending locks;
- action retry with the original expected turn;
- ordered structured logs and stale authoritative-session replacement;
- win/loss XP, replay pending locks, terminal change-plant, persisted abandon,
  and abandon retry.

Final full client command:

```powershell
npm test -w client
```

Result: PASS, 8 files and 53 tests. No timing flake occurred, so the conditional
second full-suite run was not required.

Final production build:

```powershell
npm run build -w client
```

Result: PASS. TypeScript project build completed and Vite transformed 111
modules.

Final lint:

```powershell
npm run lint -w client
```

Result: PASS with zero errors. Oxlint reported the same three Fast Refresh
warnings documented before Task 9: one for the existing mixed exports in
`PlantVisuals.tsx` and two in untouched `AuthContext.tsx`.

`git diff --check` and `git diff --cached --check` passed. The implementation
commit contained exactly five Task 9 client files. The staged metadata scan
found no co-author or prohibited attribution.

## Design Decisions

- A synchronous `inFlight` ref closes the pre-render double-click window; the
  visible pending state then disables every move and conflicting command.
- Monotonic request versions reject late roster/start/action/abandon responses
  after unmount or a newer route load. Effect cleanup reopens only the command
  latch while preserving token invalidation, allowing same-route state changes.
- A stale action response directly replaces the local session and shows a sync
  notice. The client does not issue a redundant GET because Task 8 already
  returns the authoritative session.
- Action and abandon failures retain the current session and exact retry input.
  Start failures retain selection. Replay creates a new persisted session.
- Successful abandon waits for the server response before returning to the
  roster and reports the returned zero-XP result.
- The client clamps only presentation bounds for HP and Sun. It never computes
  damage, hit results, bot moves, battle outcomes, or rewards.
- At widths below 1050px the turn console precedes a two-combatant row. Below
  720px the arena, moves, errors, and logs become one column. At 320px the
  existing shell leaves about 280px of content width; `minmax(0, 1fr)`, fixed
  button dimensions, and overflow wrapping prevent long names or values from
  changing the layout. Real-browser screenshots remain assigned to Task 11.

## Changed Files

- `client/src/services/sproutApi.ts`
- `client/src/pages/BattlePage.tsx`
- `client/src/pages/BattlePage.test.tsx`
- `client/src/components/common/PlantVisuals.tsx`
- `client/src/App.css`
