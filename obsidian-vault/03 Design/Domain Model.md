---
tags: [design, uml, domain, checkoff3]
source: Raw dump/check_off 3/Latest Diagrams 27_Jully/Plant Identification User-2026-07-20-100719.mmd (2026-07-24), C3T2_UseCaseDescription_1D.docx
updated: 2026-07-25
---

# Domain Model

> [!success] PM3 class diagram — design of record (2026-07-24)
> The diagram below is the delivered Checkoff 3 domain class diagram. Its vocabulary (`Account`, `PlantAvatar`, `PlantSpecies`, `OTP`, `Battle`, `NPC`, `BattleResult`, `QueryTicket`) is the same vocabulary used by every [[Sequence Diagram Plan|PM3 sequence diagram]] and by the official use-case descriptions, satisfying the "same nouns across all diagrams" rule.
> Source file note: in the raw dump this file is misleadingly named `Plant Identification User-2026-07-20-100719.mmd`; it contains the class diagram. Rendered PNG: `_attachments/pm3-diagrams/Sprout-class-diagram-pm3.png`. Machine-render verified 2026-07-25.

```mermaid
---
title: Sprout — Domain Class Diagram
config:
  theme: neutral
  themeVariables:
    background: '#ffffff'
    primaryColor: '#ffffff'
    lineColor: '#333333'
    primaryTextColor: '#1a1a1a'
    primaryBorderColor: '#333333'
---
classDiagram
    PVEBattle --|> Battle
    PVPBattle --|> Battle

    Account "1" *-- "1" GameStats : has
    Account "1" *-- "0..*" PasswordHistory : archives
    Account "1" *-- "0..1" OTP : issues
    Account "1" o-- "0..*" PlantAvatar : owns
    PlantAvatar "0..*" --> "1" PlantSpecies : is classified as

    Battle "1" *-- "1..*" BattleAction : consists of
    PVEBattle "1" *-- "1" NPC : contains

    Account "1" -- "0..*" BattleResult : earns
    Battle "1" -- "1..2" BattleResult : produces

    class Account {
        -accountId
        -email
        -passwordHash
    }
    class GameStats {
        -statsId
        -skillRating
        -wins
        -losses
        -draws
    }
    class PasswordHistory {
        -oldPasswordHash
        -archivedDate
    }
    class OTP {
        -otpValue
        -expiryTime
    }
    class PlantAvatar {
        -avatarId
        -imageRef
        -discoveryDate
        -battleStats
        -identificationConfidence
    }
    class PlantSpecies {
        -speciesId
        -taxonomy
        -habitat
        -conservationStatus
    }
    class Battle {
        -battleId
        -outcome
        -timestamp
    }
    class PVEBattle {
        -difficulty
    }
    class PVPBattle {
        -matchId
    }
    class NPC {
        -npcId
        -difficulty
        -sprite
    }
    class BattleAction {
        -actionId
        -type
    }
    class BattleResult {
        -result
        -statsDelta
    }
    class QueryTicket {
        -ticketId
        -referenceNumber
        -name
        -email
        -subject
        -body
        -inquiryType
    }

    note for BattleResult "Association class between Account and Battle,<br/>reified as a class (Mermaid has no association-<br/>class notation). One record per player per<br/>battle: win/loss/draw and the stats change.<br/>PVP battle produces 2, PVE produces 1."
    note for QueryTicket "Standalone: UC8 requires no login, so a<br/>ticket is keyed by email and has no<br/>association to Account."
```

Design notes baked into the diagram:

- `BattleResult` is the reified association class between `Account` and `Battle` — one record per player per battle (PVP produces 2, PVE produces 1).
- `QueryTicket` is standalone because UC8 requires no login; it is keyed by email.
- `PVEBattle`/`PVPBattle` specialize `Battle`; only PVE composes an `NPC`.
- Attribute visibility is private (`-`) and types are omitted at this analysis level.

## Design-to-implementation mapping

The implemented runtime is Firebase/Firestore. When traceability from diagram to code is needed (report Q&A, [[Test Matrix]] rows), use:

| Design class | Implemented as |
|---|---|
| `Account` | Firebase Auth identity + Firestore user profile (`UserProfile`: userId, email, displayName, isVerified) |
| `GameStats` | PVE XP/win/loss fields on the user's collection entries (`pveXp`, `pveWins`, `pveLosses`) |
| `PasswordHistory` | Password-history records checked on reset |
| `OTP` | Hashed reset-OTP document with 15-minute expiry and attempt counter |
| `PlantAvatar` | `avatar_records` documents (Archive/PVE slice) → target model `UserSpeciesCollection` + `SpriteAsset` (canonical sprite per species) |
| `PlantSpecies` | `Species` document (stable speciesId, taxonomy, facts) |
| `Battle` / `PVEBattle` | `PveBattleSession` (state machine, turn number, RNG seed, HP) |
| `BattleAction` | `BattleAction` log entries per turn |
| `BattleResult` | One-time terminal progression applied by `applyRewardOnce()` (idempotent XP/win/loss update) |
| `NPC` | Fixed, versioned bot preset (`thornback-v1` catalog) with seeded RNG |
| `QueryTicket` | `QueryTicket` document with atomic `SPR-YYYYMMDD-NNNN` reference and per-channel delivery statuses |
| `PVPBattle`, matchmaking | **Planned** — no implementation |

## Implementation data model (as coded, supporting reference)

This is the implementation-aligned model recorded 2026-07-20 for the canonical-sprite/collection architecture. It remains the storage truth for [[Database Schema]] and the test suites; it is **not** the PM3 report class diagram.

```mermaid
classDiagram
    class UserProfile {
      +String userId
      +String email
      +String displayName
      +Boolean isVerified
      +DateTime createdAt
      +markVerified()
      +canAccessProtectedRoutes() Boolean
    }
    class PasswordHistory {
      +String id
      +String passwordHash
      +DateTime changedAt
      +matches(candidate) Boolean
    }
    class Species {
      +String speciesId
      +String scientificName
      +String commonName
      +Map taxonomy
      +Map facts
      +updateMetadata(result)
    }
    class SpriteAsset {
      +String spriteAssetId
      +String recipeKey
      +String objectPath
      +String checksum
      +SpriteStatus status
      +recipeKey() String
      +markCompleted(path, checksum)
      +markFailed(code)
    }
    class UserSpeciesCollection {
      +String id
      +CollectionStatus status
      +String nickname
      +Integer pveXp
      +Integer pveWins
      +Integer pveLosses
      +DateTime firstSeenAt
      +DateTime lastSeenAt
      +recordWebVisit(at)
      +promoteToCaught(at)
      +applyPveResult(result)
    }
    class ScanEvent {
      +String scanId
      +String uploadHash
      +Float confidence
      +ScanOutcome outcome
      +DateTime scannedAt
      +complete(speciesId)
      +fail(errorCode)
    }
    class PveBattleSession {
      +String sessionId
      +BattleState state
      +Integer turnNumber
      +String rngSeed
      +Integer playerHp
      +Integer botHp
      +Boolean rewardApplied
      +submitAction(moveId, expectedTurn)
      +chooseBotMove()
      +resolveRound()
      +applyRewardOnce()
    }
    class BattleAction {
      +String actionId
      +Integer turnNumber
      +ActorSide actor
      +String moveId
      +Integer amount
      +DateTime createdAt
    }
    class QueryTicket {
      +String ticketId
      +String referenceNumber
      +TicketCategory category
      +String message
      +DeliveryStatus submitterEmailStatus
      +DeliveryStatus adminEmailStatus
      +recordDelivery(channel, result)
    }

    UserProfile "1" *-- "0..*" PasswordHistory : retains
    UserProfile "1" o-- "0..*" UserSpeciesCollection : owns
    Species "1" --> "0..*" UserSpeciesCollection : identifies
    Species "1" o-- "0..*" SpriteAsset : has versioned art
    UserProfile "1" --> "0..*" ScanEvent : initiates
    Species "0..1" --> "0..*" ScanEvent : result
    UserProfile "1" --> "0..*" PveBattleSession : participates
    UserSpeciesCollection "1" --> "0..*" PveBattleSession : selected plant
    PveBattleSession "1" *-- "0..*" BattleAction : logs
```

### Implementation invariants

- `Species.speciesId` is the stable identity; scientific-name text is metadata.
- One collection row exists for each `(userId, speciesId)`.
- `VISITED` may promote to `CAUGHT`; no demotion.
- One canonical sprite exists for each versioned recipe key.
- A completed sprite has an object path and checksum.
- PVE actions require the expected turn and rewards apply once.
- Ticket notification states do not determine whether the ticket exists.

> [!warning] Historical image
> `_attachments/Sprout_DomainClassDiagram.png` (2026-07-07) is an earlier draft retained as a source artifact only. The 2026-07-24 Mermaid diagram above replaces it; do not submit the old PNG.

## Related

[[Database Schema]] · [[System Architecture]] · [[Sequence Diagram Plan]] · [[Use Case Model]]
