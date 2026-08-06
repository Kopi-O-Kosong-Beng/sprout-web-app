---
tags: [design, uml, sequence, checkoff3]
aliases: [Sequence Diagrams, PM3 Sequence Diagram Set]
source: Raw dump/check_off 3/Latest Diagrams 27_Jully (2026-07-24), C3T2_UseCaseDescription_1D.docx, UC5-UC8 Claude handoff notes (2026-07-20)
updated: 2026-07-25
---

# Sequence Diagrams — Checkoff 3 Set

> [!success] Design of record (2026-07-24 set)
> The delivered PM3 sequence-diagram set — UC1–UC8, with UC7 split into UC7a (match lifecycle) and UC7b (connection failures) — plus the [[Domain Model|domain class diagram]] lives in `Raw dump/check_off 3/Latest Diagrams 27_Jully/` and is mirrored below.
> All ten files were machine-rendered **without errors** (mermaid-cli, 2026-07-25) and verified line-by-line against the official use-case description `C3T2_UseCaseDescription_1D.docx`.
> Report-ready PNGs: `_attachments/pm3-diagrams/`.

> [!warning] Supersedes the earlier "implementation-labeled" plan
> The previous version of this note required every diagram to carry Firebase/Firestore implementation vocabulary and an "As Implemented" caption. The team's delivered set instead models at the **domain/analysis level** (controllers + domain entities from the class diagram), consistent with the course's UML conventions and the official use-case descriptions. Where design-level lifelines abstract over implementation details, the mapping is recorded in [[#Design-to-implementation mapping]] so demo Q&A answers stay accurate.

## Verification summary (2026-07-25)

| Diagram | Renders | Matches UC description v1D | Notes |
|---|---|---|---|
| UC1 Signup | ✅ | ⚠️ label mismatch | Diagram branches `3b invalid username`, `3c invalid password`, `3d already registered` do not exist in v1D (which has only `3a` invalid email, `3b` already registered, `5a` consent/auth error, and no username field). **Action:** update the UC1 description for the report (add username to step 1; add 3a–3d alternative flows) or relabel the diagram. See [[Open Questions and Inconsistencies]]. |
| UC2 Login | ✅ | ✅ | Branches map to 2a incorrect password / 2b no account. |
| UC3 Reset Password | ✅ | ✅ | `3a` delivery timeout, `4a` max attempts lockout, `4b` expired-OTP resend all match; docx 5a/6b/7a are collapsed into one "weak / mismatched / recently used" else-branch. Uses `create`/`destroy` for the OTP lifeline (needs Mermaid ≥ 10.3 — renders fine). |
| UC4 Browse Archival | ✅ | ✅ | Branches map to 1a DB unreachable / 1b empty collection. |
| UC5 Join PVE | ✅ | ✅ | 2b decline-upload dead end, 5a NPC error retry, 8a web-only save, 8b try-other-avatar all present; BattleResult persistence added consistent with the class diagram. |
| UC6 Upload Plant Picture | ✅ | ✅ | 2a invalid image, 4a low confidence (≥ 0.85 gate), 7a Gemma timeout, 9a generation failure all present; optional web-archival save modeled with `opt`. |
| UC7a Join PVP | ✅ | ✅ | 2a no-opponent timeout, 4b auto-assign, 6a turn skip, 9a DB write retry/cache fallback; note points to UC7b for 4a/6b/6c. |
| UC7b PVP connection failures | ✅ | ✅ | 4a selection-phase drop → requeue; 6b mid-battle disconnect → 30 s grace → default win + penalty; 6c socket error → 5 retries → resume or record draw. |
| UC8 Submit Query Ticket | ✅ | ✅ | 3a validation failure, 5a email timeout logged-for-retry; ticket persists and reference number returns regardless of email outcome. |
| Class diagram | ✅ | — | See [[Domain Model]]. File is misleadingly named `Plant Identification User-2026-07-20-100719.mmd` in the dump but contains the domain class diagram. |

## Conventions adopted

- **Lifelines:** actor → `UI` boundary → one controller per subsystem (`AuthController`, `AvatarController`, `BattleController`, `PvpController`, `PlantController`, `QueryController`) → domain entities from the class diagram (`Account`, `OTP`, `PlantAvatar`, `PlantSpecies`, `Battle`, `NPC`, `BattleResult`, `QueryTicket`) → `DB`.
- **Actors:** only true externals are `actor` lifelines — `EmailServer`, `PlantIdAPI`, `GemmaAPI`, `FluxAPI`, plus human actors (`Visitor`, `User`, `Opponent`, `All`). The database, game engine, and `MultiplayerServer` stay internal participants, matching the [[Use Case Model]] rule that internal components are not actors.
- **Object lifecycle:** `«create»` message stereotypes; UC3 uses Mermaid `create participant` / `destroy` for the OTP.
- **Fragments:** `alt` for exclusive outcomes, `opt` for genuinely optional steps (UC6 save, UC7a auto-assign), `loop` for turn/OTP retries, `par` for simultaneous PVP picks.
- **Async:** fire-and-forget emails use the async arrow `-)` (onboarding, OTP send, confirmation emails).
- **Activation:** activation bars are balanced per branch (verified by rendering); every flow closes back to the initiating actor.
- **Numbering:** branch labels like `3a`, `4b`, `6c` reference the alternative-flow numbering of the official use-case description document, not Mermaid autonumbers.

## Design-to-implementation mapping

The diagrams are analysis-level. When the demo or Q&A needs code-level answers, use this mapping (implementation truth lives in [[System Architecture]], [[API Contract]], [[Database Schema]]):

| Diagram element | Implemented as | Delta to disclose if asked |
|---|---|---|
| `AuthController` + `Account` validation (UC1–UC3) | Firebase Auth (client SDK sign-in, ID tokens, action codes) + Express token verification + Firestore profiles | UC2 diagram shows credential validation "against the DB"; in code Firebase Auth is the authority and Sprout never sees the password. UC1 diagram creates the account only after ownership confirmation; in code the Firebase identity is created first and verified via action-code link. |
| UC3 "No account found" response | Anti-enumeration: the API returns the same generic 200 for known and unknown emails | Diagram follows the v1D description; the implemented behavior is stricter for security. Note this as a security refinement in the report. |
| `OTP` entity | Hashed OTP document with 15-min TTL and attempt counter in Firestore | Matches; "account locked (4a)" maps to the five-attempt invalidation gap being closed. |
| `PlantController` + `PlantIdAPI`/`GemmaAPI`/`FluxAPI` (UC6) | Planned upload pipeline (parallel teammate build); earlier web target named Gemini + remove.bg for generation/post-processing | Report vocabulary keeps the requirement-doc actors (plant.id, Gemma, FLUX). Do **not** claim the web pipeline is implemented — see [[UC6 Upload Plant Picture]]. |
| `BattleController`, `Battle`, `NPC`, `BattleResult` (UC5) | Server-authoritative engine + Firestore session/reward transactions (`7991254` evidence) | Implemented PVE uses expected-turn numbers, seeded RNG, idempotent rewards — richer than the diagram; diagram stays valid as an abstraction. |
| `PvpController`, `MultiplayerServer` (UC7) | **Planned final architecture** — not implemented | Label UC7a/UC7b "Planned" in the report and demo. |
| `QueryController` + `QueryTicket` (UC8) | Public Contact page → validation → Firestore ticket → atomic `SPR-YYYYMMDD-NNNN` reference → independent user/admin email attempts with stored delivery statuses | Implemented form fields are `name, email, category, message`; the diagram/description lists `organisation, subject, inquiry type`. Align the report form-field list or note the refinement. |
| `DB` | Firestore (runtime is Firebase/Firestore only) | — |
| `EmailServer` | SMTP adapter; console adapter in tests | Real-inbox delivery remains unverified — do not claim live email. |

## The diagrams

Each section shows the Mermaid source (renders in Obsidian) with its report PNG.

### UC1 — Signup

Source: `Latest Diagrams 27_Jully/UC1.mmd` · PNG: `_attachments/pm3-diagrams/UC1-signup-seq.png` · ⚠️ label issue above

```mermaid
---
title: UC1 — Signup
config:
  theme: neutral
  themeVariables:
    background: '#ffffff'
    primaryColor: '#ffffff'
    lineColor: '#333333'
    primaryTextColor: '#1a1a1a'
    primaryBorderColor: '#333333'
---
sequenceDiagram
    actor Visitor
    participant UI
    participant AuthController
    participant Account
    participant DB
    actor EmailServer

    Visitor->>UI: enter email and password
    activate UI
    UI->>AuthController: submitSignup(email, password)
    activate AuthController

    AuthController->>EmailServer: verifyEmail(email)
    activate EmailServer
    EmailServer-->>AuthController: verification result
    deactivate EmailServer

    %% Kept nested: verifyEmail must pass and the confirmation-link round trip must complete before the ownership outcome exists, so a single flat alt would misrepresent the ordering.
    alt email valid and not registered
        AuthController-)EmailServer: sendConfirmationEmail(email)
        AuthController-->>UI: confirmation email sent
        UI-->>Visitor: show("Verification email sent — check your inbox")
        Visitor->>UI: open verification link
        UI->>AuthController: confirmOwnership(email)
        AuthController->>EmailServer: confirmOwnership(email)
        activate EmailServer
        EmailServer-->>AuthController: ownership result
        deactivate EmailServer

        alt ownership verified
            AuthController->>Account: «create» Account(email, passwordHash)
            AuthController->>Account: save()
            activate Account
            Account->>DB: insert(account)
            activate DB
            DB-->>Account: saved
            deactivate DB
            Account-->>AuthController: saved
            deactivate Account

            AuthController-)EmailServer: sendOnboardingEmail(email)
            AuthController-->>UI: signup success
            UI-->>Visitor: redirect as authenticated User
        else authentication error or consent denied
            AuthController-->>UI: authentication error
            UI-->>Visitor: show("Authentication failed — return to start")
        end
    else invalid or unreachable email — 3a
        AuthController-->>UI: invalid email
        UI-->>Visitor: show("Invalid email — return to start")
    else invalid username — 3b
        AuthController-->>UI: invalid username
        UI-->>Visitor: show("Invalid username — return to start")
    else invalid password — 3c
        AuthController-->>UI: invalid password
        UI-->>Visitor: show("Invalid password — return to start")
    else email already registered — 3d
        AuthController-->>UI: already registered
        UI-->>Visitor: show("Email registered — please log in")
    end

    deactivate AuthController
    deactivate UI
```

### UC2 — Login

Source: `Latest Diagrams 27_Jully/UC2.mmd` · PNG: `_attachments/pm3-diagrams/UC2-login-seq.png`

```mermaid
---
title: UC2 — Login
config:
  theme: neutral
  themeVariables:
    background: '#ffffff'
    primaryColor: '#ffffff'
    lineColor: '#333333'
    primaryTextColor: '#1a1a1a'
    primaryBorderColor: '#333333'
---
sequenceDiagram
    actor User
    participant UI
    participant AuthController
    participant Account
    participant DB

    User->>UI: enter email and password
    activate UI
    UI->>AuthController: submitLogin(email, password)
    activate AuthController

    AuthController->>Account: validateCredentials(email, password)
    activate Account
    Account->>DB: findByEmail(email)
    activate DB
    DB-->>Account: account record
    deactivate DB
    Account-->>AuthController: validation result
    deactivate Account

    alt credentials valid
        AuthController->>AuthController: createSessionToken(account)
        AuthController->>Account: fetchAvatarsAndStats(accountId)
        activate Account
        Account->>DB: fetchAvatarsAndStats(accountId)
        activate DB
        DB-->>Account: latest avatars + game stats
        deactivate DB
        Account-->>AuthController: latest avatars + game stats
        deactivate Account
        AuthController-->>UI: session token + synced data
        UI-->>User: show authenticated workspace
    else incorrect password
        AuthController-->>UI: invalid credentials
        UI-->>User: show("Invalid credentials")
    else no account found
        AuthController-->>UI: account not found
        UI-->>User: show("Account does not exist")
    end

    deactivate AuthController
    deactivate UI
```

### UC3 — Reset Password

Source: `Latest Diagrams 27_Jully/UC3.mmd` · PNG: `_attachments/pm3-diagrams/UC3-reset-password-seq.png`

```mermaid
---
title: UC3 — Reset Password
config:
  theme: neutral
  themeVariables:
    background: '#ffffff'
    primaryColor: '#ffffff'
    lineColor: '#333333'
    primaryTextColor: '#1a1a1a'
    primaryBorderColor: '#333333'
---
sequenceDiagram
    %% REMINDER: document the OTP-send delivery timeout (3a) as an alternative flow in the UC3 use-case description (separate file, not edited here).
    %% Nesting rationale: the outer two alts are sequential gates — [account exists] must hold before an OTP is sent, and [delivery confirmed] must hold before OTP entry begins. The inner forks are terminal outcomes, not gates: the [OTP validated] vs [max attempts reached — 4a] alt branches on which way the completed retry loop exited, and the [strong/matches/not reused] vs [weak/mismatched/recently used] alt is the password step's success/failure. These inner forks are kept nested within the branch they belong to for locality and readability, per the "nest only where clearest" guidance — not because flattening would change the logic.
    actor User
    participant UI
    participant AuthController
    participant Account
    participant DB

    User->>UI: enter registered email
    activate UI
    UI->>AuthController: requestReset(email)
    activate AuthController
    AuthController->>Account: isRegistered(email)
    activate Account
    Account->>DB: findByEmail(email)
    activate DB
    DB-->>Account: account record
    deactivate DB
    Account-->>AuthController: exists / not found
    deactivate Account

    alt email associated with an account
        create participant OTP
        AuthController->>OTP: «create» generate(expiryTime)
        actor EmailServer
        AuthController-)EmailServer: sendOTP(email, otp)

        alt delivery confirmed
            EmailServer-->>AuthController: delivery result
            AuthController-->>UI: OTP sent
            UI-->>User: show("OTP sent — check your email")
            loop until OTP valid or max attempts reached
                User->>UI: enter OTP
                UI->>AuthController: submitOTP(enteredOtp)
                AuthController->>OTP: validate(enteredOtp)
                activate OTP
                OTP->>DB: validate against stored code
                activate DB
                DB-->>OTP: valid / invalid / expired
                deactivate DB
                OTP-->>AuthController: valid / invalid / expired
                deactivate OTP
                alt OTP expired (resend a new code — 4b)
                    AuthController->>OTP: regenerate(expiryTime)
                    activate OTP
                    OTP->>DB: persist new code
                    activate DB
                    DB-->>OTP: new code
                    deactivate DB
                    OTP-->>AuthController: new code
                    deactivate OTP
                    AuthController-)EmailServer: resendOTP(email, otp)
                end
            end

            alt OTP validated
                User->>UI: enter new password + confirmation
                UI->>AuthController: submitNewPassword(pwd, confirm)
                AuthController->>AuthController: validateStrength(pwd)

                alt strong, matches confirmation, and not recently used
                    AuthController->>Account: checkPasswordHistory(pwd)
                    activate Account
                    Account->>DB: query recent passwords
                    activate DB
                    DB-->>Account: not reused
                    deactivate DB
                    Account-->>AuthController: not reused
                    deactivate Account
                    AuthController->>Account: updatePassword(pwd)
                    activate Account
                    Account->>DB: persist new password
                    activate DB
                    DB-->>Account: updated
                    deactivate DB
                    Account-->>AuthController: updated
                    deactivate Account
                    AuthController->>Account: archiveOldPassword()
                    activate Account
                    Account->>DB: archive previous hash
                    activate DB
                    DB-->>Account: archived
                    deactivate DB
                    Account-->>AuthController: archived
                    deactivate Account
                    destroy OTP
                    AuthController->>OTP: invalidate()
                    AuthController-->>UI: reset success
                    UI-->>User: redirect to Login (UC2)
                else weak / mismatched / recently used
                    AuthController-->>UI: validation error
                    UI-->>User: show(specific error, retry)
                end
            else max attempts reached — account locked (4a)
                AuthController-->>UI: account locked
                UI-->>User: show("Too many attempts — account temporarily locked")
            end
        else timeout — no response (3a)
            AuthController-->>UI: delivery failed
            UI-->>User: show("Could not send OTP — Resend option")
        end
    else no account found
        AuthController-->>UI: no account
        UI-->>User: show("No account found with this email")
    end

    deactivate AuthController
    deactivate UI
```

### UC4 — Browse Plant Avatar Archival

Source: `Latest Diagrams 27_Jully/UC4.mmd` · PNG: `_attachments/pm3-diagrams/UC4-archive-seq.png`

```mermaid
---
title: UC4 — Browse Plant Avatar Archival
config:
  theme: neutral
  themeVariables:
    background: '#ffffff'
    primaryColor: '#ffffff'
    lineColor: '#333333'
    primaryTextColor: '#1a1a1a'
    primaryBorderColor: '#333333'
---
sequenceDiagram
    actor User
    participant UI
    participant AvatarController
    participant PlantAvatar
    participant DB

    User->>UI: open plant avatar archive
    activate UI
    UI->>AvatarController: getArchive(accountId)
    activate AvatarController
    AvatarController->>PlantAvatar: getArchive(accountId)
    activate PlantAvatar
    PlantAvatar->>DB: fetchAvatars(accountId)
    activate DB
    DB-->>PlantAvatar: avatar records
    deactivate DB
    PlantAvatar-->>AvatarController: avatar records
    deactivate PlantAvatar

    alt avatars found
        AvatarController-->>UI: avatar collection
        UI-->>User: display grid (image, species, discovery date)
        User->>UI: select an avatar
        UI->>AvatarController: getAvatarDetails(avatarId)
        AvatarController->>PlantAvatar: getDetails(avatarId)
        activate PlantAvatar
        PlantAvatar->>DB: fetchDetails(avatarId)
        activate DB
        DB-->>PlantAvatar: species data, habitat, stats
        deactivate DB
        PlantAvatar-->>AvatarController: species data, habitat, stats
        deactivate PlantAvatar
        AvatarController-->>UI: avatar details
        UI-->>User: display details
    else database unreachable
        AvatarController-->>UI: cached data + sync warning
        UI-->>User: display cached grid with warning banner
    else no avatars in collection
        AvatarController-->>UI: empty
        UI-->>User: show empty-state (explore via mobile app)
    end

    deactivate AvatarController
    deactivate UI
```

### UC5 — Join PVE Battle

Source: `Latest Diagrams 27_Jully/UC5.mmd` · PNG: `_attachments/pm3-diagrams/UC5-pve-seq.png`

```mermaid
---
title: UC5 — Join PVE Battle
config:
  theme: neutral
  themeVariables:
    background: '#ffffff'
    primaryColor: '#ffffff'
    lineColor: '#333333'
    primaryTextColor: '#1a1a1a'
    primaryBorderColor: '#333333'
---
sequenceDiagram
    actor User
    participant UI
    participant BattleController
    participant Battle
    participant NPC
    participant BattleResult
    participant PlantAvatar
    participant DB

    User->>+UI: request PVE battle
    UI->>+BattleController: startPveBattle(avatarId)

    alt no avatars and declines upload
        BattleController-->>UI: no avatar available
        UI-->>User: show("Upload a plant or explore via mobile app")
    else avatar available (from archival or UC6 upload)
        BattleController->>+Battle: «create» Battle(avatar)
        Battle-->>-BattleController: created
        BattleController->>+NPC: «create» NPC(difficulty scaled to skill)
        NPC->>+DB: fetchSprite(npcId)
        DB-->>-NPC: sprite and stats
        NPC-->>-BattleController: NPC ready
        BattleController-->>UI: battle ready
        UI-->>User: load battle interface (avatar + NPC stats)

        loop each turn until a side reaches 0 HP
            User->>UI: select action (attack / defend / special)
            UI->>BattleController: submitTurn(action)
            BattleController->>+NPC: requestAction()
            alt NPC calculation error
                NPC-->>BattleController: error
                BattleController->>BattleController: log error, restore last valid state
                BattleController-->>UI: retry required
                UI-->>User: offer retry of the turn
            else success
                NPC-->>BattleController: NPC action
                BattleController-->>UI: turn result
                UI-->>User: render turn outcome
            end
            deactivate NPC
        end

        BattleController->>+Battle: setOutcome(result)
        Battle->>+DB: persist(battle)
        DB-->>-Battle: saved
        Battle-->>-BattleController: outcome recorded
        BattleController->>+BattleResult: «create» BattleResult(player, outcome, statsDelta)
        BattleResult->>+DB: persist(result)
        DB-->>-BattleResult: saved
        BattleResult-->>-BattleController: recorded
        BattleController-->>UI: battle summary
        UI-->>User: display battle summary and outcome

        alt re-battle same avatar
            User->>UI: re-battle
        else save avatar (web-only)
            User->>UI: save avatar
            UI->>BattleController: saveWebAvatar(avatarId)
            BattleController->>+PlantAvatar: saveToWebArchival()
            PlantAvatar->>+DB: persist(avatar)
            DB-->>-PlantAvatar: saved
            PlantAvatar-->>-BattleController: saved
            BattleController-->>UI: saved
            UI-->>User: confirm saved
        else try other avatar
            User->>UI: return to avatar selection
        end
    end
    deactivate BattleController
    deactivate UI
```

### UC6 — Upload Plant Picture

Source: `Latest Diagrams 27_Jully/UC6.mmd` · PNG: `_attachments/pm3-diagrams/UC6-upload-seq.png` · **Planned** on web — see [[UC6 Upload Plant Picture]]

```mermaid
---
title: UC6 — Upload Plant Picture
config:
  theme: neutral
  themeVariables:
    background: '#ffffff'
    primaryColor: '#ffffff'
    lineColor: '#333333'
    primaryTextColor: '#1a1a1a'
    primaryBorderColor: '#333333'
---
sequenceDiagram
    actor User
    participant UI
    participant PlantController
    participant PlantAvatar
    participant PlantSpecies
    participant DB
    actor PlantIdAPI
    actor GemmaAPI
    actor FluxAPI

    User->>+UI: submit plant photograph
    UI->>+PlantController: uploadPlant(image)
    PlantController->>PlantController: validate format and size (Sharp / Multer)

    alt invalid format or size
        PlantController-->>UI: invalid image
        UI-->>User: show("Error — accepted formats and size limits")
    else valid image
        PlantController->>+PlantIdAPI: classify(image)
        alt confidence >= 0.85
            PlantIdAPI-->>PlantController: species data (name, taxonomy, confidence)
            PlantController->>+PlantSpecies: «create» PlantSpecies(data)
            PlantSpecies-->>-PlantController: created
            PlantController->>+GemmaAPI: refinePrompt(speciesData)
            alt Gemma timeout or error
                GemmaAPI-->>PlantController: error
                PlantController-->>UI: processing failure
                UI-->>User: show("Processing failure — offer retry")
            else success
                GemmaAPI-->>PlantController: refined pixel-art prompt
                PlantController->>+FluxAPI: generate(prompt)
                alt generation failure
                    FluxAPI-->>PlantController: error
                    PlantController-->>UI: generation failure
                    UI-->>User: show("Generation failure — offer retry")
                else success
                    FluxAPI-->>PlantController: pixel-art avatar
                    PlantController->>+PlantAvatar: «create» PlantAvatar(image, species, confidence)
                    PlantAvatar-->>-PlantController: created
                    PlantController-->>UI: species info + temporary avatar
                    UI-->>User: display species info + temporary avatar
                    opt user saves for web reuse
                        User->>UI: save avatar
                        UI->>PlantController: saveWebAvatar()
                        PlantController->>+PlantAvatar: saveToWebArchival()
                        PlantAvatar->>+DB: persist(avatar)
                        DB-->>-PlantAvatar: saved
                        PlantAvatar-->>-PlantController: saved
                    end
                end
                deactivate FluxAPI
            end
            deactivate GemmaAPI
        else low confidence / not identified
            PlantIdAPI-->>PlantController: low confidence
            PlantController-->>UI: not identified
            UI-->>User: show("Could not identify — suggest retaking photo")
        end
        deactivate PlantIdAPI
    end
    deactivate PlantController
    deactivate UI
```

### UC7a — Join PVP Battle

Source: `Latest Diagrams 27_Jully/UC7a.mmd` · PNG: `_attachments/pm3-diagrams/UC7a-pvp-seq.png` · **Planned final architecture** — not implemented

```mermaid
---
title: UC7a — Join PVP Battle
config:
  theme: neutral
  themeVariables:
    background: '#ffffff'
    primaryColor: '#ffffff'
    lineColor: '#333333'
    primaryTextColor: '#1a1a1a'
    primaryBorderColor: '#333333'
---
sequenceDiagram
    actor User
    participant UI
    participant PvpController
    participant MultiplayerServer
    participant Battle
    participant BattleResult
    participant DB
    participant OpponentUI
    actor Opponent

    User->>+UI: select PVP battle mode
    UI->>+PvpController: joinMatchmaking()
    PvpController->>+MultiplayerServer: enterQueue(skillRating)

    alt no opponent found within timeout
        MultiplayerServer-->>-PvpController: timeout
        PvpController-->>UI: no opponents available
        UI-->>User: show("No opponents — try PVE (UC5) or retry later")
    else opponent found
        activate MultiplayerServer
        MultiplayerServer-->>-PvpController: matched opponent (skill + latency)
        PvpController->>+Battle: «create» Battle(bothPlayers)
        Battle-->>-PvpController: created
        PvpController-->>UI: match found
        UI-->>User: show battle lobby
        PvpController-->>OpponentUI: match found
        OpponentUI-->>Opponent: show battle lobby

        par both pick avatar within time limit
            User->>UI: select avatar from archival
            UI->>PvpController: selectAvatar(avatarId)
        and
            Opponent->>OpponentUI: select avatar from archival
            OpponentUI->>PvpController: selectAvatar(avatarId)
        end
        opt a user does not pick in time
            PvpController->>PvpController: randomly assign avatar from that user's archival
        end

        PvpController-->>UI: load battle interface (both stats)
        PvpController-->>OpponentUI: both avatars' stats
        OpponentUI-->>Opponent: load battle interface (both stats)

        loop each turn until a side reaches 0 HP
            alt action selected in time
                User->>UI: select action (attack / defend / special)
                UI->>PvpController: submitAction(action)
                Opponent->>OpponentUI: select action (attack / defend / special)
                OpponentUI->>PvpController: submitAction(action)
            else a user misses the turn timer
                PvpController->>PvpController: skip that user's turn, pass to opponent
            end
            PvpController-->>UI: render turn outcome
            PvpController-->>OpponentUI: turn outcome
            OpponentUI-->>Opponent: render turn outcome
        end

        PvpController->>+Battle: determineWinner()
        Battle-->>-PvpController: outcome

        alt DB write succeeds
            PvpController->>+BattleResult: «create» BattleResult(perPlayer)
            BattleResult->>+DB: persist(results)
            DB-->>-BattleResult: write acknowledged
            BattleResult-->>-PvpController: recorded
        else DB write failure
            PvpController->>+BattleResult: «create» BattleResult(perPlayer)
            BattleResult->>+DB: retry write (up to 3 times)
            DB-->>-BattleResult: still failing
            BattleResult-->>-PvpController: write failed
            PvpController->>PvpController: cache results, schedule background write
            PvpController-->>UI: stats may be delayed
            UI-->>User: notify stats may be delayed
            PvpController-->>OpponentUI: stats may be delayed
            OpponentUI-->>Opponent: notify stats may be delayed
        end

        PvpController-->>UI: battle summary
        UI-->>User: display battle summary and outcome
        PvpController-->>OpponentUI: battle summary
        OpponentUI-->>Opponent: display battle summary and outcome
    end
    deactivate PvpController
    deactivate UI

    Note over User,Opponent: Connection-failure handling (4a, 6b, 6c) shown in UC7b
```

### UC7b — Join PVP Battle (connection failures)

Source: `Latest Diagrams 27_Jully/UC7b.mmd` · PNG: `_attachments/pm3-diagrams/UC7b-pvp-failures-seq.png` · **Planned final architecture** — not implemented

```mermaid
---
title: UC7b — Join PVP Battle (connection failures)
config:
  theme: neutral
  themeVariables:
    background: '#ffffff'
    primaryColor: '#ffffff'
    lineColor: '#333333'
    primaryTextColor: '#1a1a1a'
    primaryBorderColor: '#333333'
---
sequenceDiagram
    actor User
    participant UI
    participant PvpController
    participant MultiplayerServer
    participant Battle
    participant BattleResult
    participant DB
    participant OpponentUI
    actor Opponent

    Note over User,Opponent: 4a WebSocket failure during avatar selection
    activate PvpController
    PvpController->>PvpController: detect connection drop via heartbeat timeout
    loop auto-reconnect (up to 5 retries, increasing delay)
        PvpController->>PvpController: attempt reconnection
    end
    alt reconnect succeeds
        PvpController-->>UI: resume selection
        UI-->>User: resume plant avatar selection
    else all retries fail
        PvpController-->>UI: session lost
        UI-->>User: show("Session lost — retry matchmaking")
        PvpController-->>OpponentUI: session lost
        OpponentUI-->>Opponent: show("Session lost — retry matchmaking")
        PvpController->>MultiplayerServer: return to matchmaking queue
    end
    deactivate PvpController

    Note over User,Opponent: 6b a user disconnects mid-battle
    activate PvpController
    PvpController->>PvpController: pause battle, give disconnected user 30s to reconnect
    alt reconnects within 30s
        User->>UI: reconnect
        UI->>PvpController: rejoinBattle()
        PvpController-->>UI: resume from current state
        UI-->>User: resume battle from current state
    else timer expires
        PvpController->>PvpController: award remaining user a default win
        PvpController->>+BattleResult: «create» BattleResult(disconnectPenalty)
        BattleResult->>+DB: persist(penalty)
        DB-->>-BattleResult: recorded
        BattleResult-->>-PvpController: recorded
    end
    deactivate PvpController

    Note over User,Opponent: 6c WebSocket error mid-battle
    activate PvpController
    PvpController->>PvpController: detect connection drop via heartbeat timeout
    loop auto-reconnect (up to 5 retries, increasing delay)
        PvpController->>PvpController: attempt reconnection
    end
    alt reconnect succeeds
        PvpController-->>UI: resume from server-side state
        UI-->>User: resume battle from server-side game state
        PvpController-->>OpponentUI: resume from server-side state
        OpponentUI-->>Opponent: resume battle from server-side game state
    else all retries fail
        PvpController-->>UI: session lost
        UI-->>User: session lost
        PvpController-->>OpponentUI: session lost
        OpponentUI-->>Opponent: session lost
        PvpController->>+Battle: markAsDraw(incompleteState)
        Battle->>+DB: persist(battle)
        DB-->>-Battle: saved
        Battle-->>-PvpController: saved
    end
    deactivate PvpController
```

### UC8 — Submit Query Ticket

Source: `Latest Diagrams 27_Jully/UC8.mmd` · PNG: `_attachments/pm3-diagrams/UC8-query-ticket-seq.png`

```mermaid
---
title: UC8 — Submit Query Ticket
config:
  theme: neutral
  themeVariables:
    background: '#ffffff'
    primaryColor: '#ffffff'
    lineColor: '#333333'
    primaryTextColor: '#1a1a1a'
    primaryBorderColor: '#333333'
---
sequenceDiagram
    actor All as All (Visitor / User)
    participant UI
    participant QueryController
    participant QueryTicket
    participant DB
    actor EmailServer

    All->>+UI: open Contact Us page
    UI-->>-All: display query form (name, email, organisation [optional], subject, message, inquiry type)
    All->>+UI: fill required fields and submit
    UI->>+QueryController: submitQuery(formData)
    QueryController->>QueryController: validate inputs (email format, required fields, message length)

    alt validation fails
        QueryController-->>UI: invalid fields
        UI-->>All: highlight invalid fields inline (data preserved)
    else valid submission
        QueryController->>+QueryTicket: «create» QueryTicket(formData)
        QueryTicket->>+DB: persist(ticket)
        DB-->>-QueryTicket: stored
        QueryTicket-->>-QueryController: reference number
        QueryController-)EmailServer: sendConfirmationEmail(email, referenceNumber)
        alt delivery confirmed
            EmailServer-->>QueryController: sent
        else timeout — no response (5a)
            QueryController->>QueryController: log email failure for retry
        end
        QueryController->>QueryController: notify Sprout team of new incoming ticket
        QueryController-->>UI: ticket created
        UI-->>All: display confirmation page with reference number
    end
    deactivate QueryController
    deactivate UI
```

## Superseded material

- The 2026-07-20 Router/Adapter (ECB + Express-route lifelines, `autonumber`) drafts for UC5–UC8 in `Raw dump/check_off 3/Latest Diagrams/Sprout_SequenceDiagrams_Handoff_plaintext.md` are **historical**; the 27_Jully set replaces them.
- The UC6 call-graph integration-order material formerly on this page lives in [[Testing Strategy]] (call-graph bottom-up section).

## Related

[[Use Case Model]] · [[Domain Model]] · [[System Architecture]] · [[Testing Strategy]] · [[Open Questions and Inconsistencies]] · [[Checkoff 3 Readiness and Development Plan]]
