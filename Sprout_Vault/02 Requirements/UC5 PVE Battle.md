---
tags: [use-case, battle, checkoff3]
id: UC5
source: C3T2_UseCaseDescription_1D.docx, Android reference audit, team decision 2026-07-20
---

# UC5 - PVE Battle

**Checkoff 3 evidence:** isolated feature unless the whole route/UI is integrated by video freeze.  
**Description:** A verified user selects one collected plant and fights a fixed, versioned system-controlled opponent in an alternating turn-based battle.  
**Actors:** Primary - User. The bot and battle engine are internal Sprout components.  
**Trigger:** User requests a PVE battle.  
**Precondition:** User is verified and owns at least one collection entry eligible for PVE.  
**Postcondition:** Battle is won, lost, or abandoned; one idempotent reward result is persisted.  
**Error states:** No eligible plant, invalid/foreign session, stale action, invalid transition, persistence failure.

## Operation flow

1. Sprout displays the user's eligible collected plants.
2. User selects one plant.
3. Sprout creates a battle session with a versioned NPC preset, initial HP, and stored RNG seed.
4. Sprout enters `PLAYER_ACTION` and returns the current state and turn number.
5. User submits a valid move with the expected turn number.
6. Sprout transitions through `BOT_ACTION`, where the bot randomly selects one valid move using the stored seed.
7. Sprout resolves the round, appends action logs, and floors HP at zero.
8. Sprout checks the result.
9. If both plants remain active, Sprout increments the turn and returns to `PLAYER_ACTION`.
10. If the user wins or loses, Sprout marks completion and applies the reward once.
11. Sprout displays the battle summary and XP result.

## State machine

```text
PLAYER_ACTION -> BOT_ACTION -> RESOLVE_ROUND -> CHECK_RESULT
      ^                                      |
      |---------------- active --------------|
                                             +-> WON / LOST
```

## Alternative flows

- **2a No eligible plant:** direct the user to UC6; do not start an empty session.
- **5a Invalid move:** reject without advancing the turn.
- **5b Stale/duplicate turn number:** return the current state without applying damage again.
- **7a Resolution failure:** keep the last persisted valid state and return a retriable error.
- **10a Reward retry:** detect the completion marker and return the original result without applying XP twice.
- **Abandon:** mark abandoned and apply no XP.

## Rewards and limits

| Outcome | Persistent result |
|---|---|
| Win | +20 PVE XP, +1 PVE win, update best win streak |
| Loss | +5 PVE XP, +1 PVE loss, reset current streak |
| Abandon | No XP |

Battle HP is temporary and restored after the session. XP does not scale combat stats in Checkoff 3. A public leaderboard is deferred because unrestricted XP is farmable.

## Android reuse decision

Reuse the Android alternating-state concept and versioned move/taxonomy data. Do not copy its activity-owned state, cloned player-garden opponent, or nondeterministic random calls. Server authority, expected turn numbers, and stored RNG seed are required for web retries and testing.

## Related

[[UC4 Browse Avatar Archival]] · [[Domain Model]] · [[Testing Strategy]] · [[Checkoff 3 Readiness and Development Plan]]
