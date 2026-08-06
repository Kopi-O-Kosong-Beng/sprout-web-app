---
tags: [use-case, collection, checkoff3, final]
id: UC4
source: C3T2_UseCaseDescription_1D.docx, team decision 2026-07-20, team Telegram 2026-08-01
updated: 2026-08-01
---

# UC4 - Browse Plant Collection

**Checkoff 3 evidence:** integrated result view for UC6.  
**Description:** A verified user browses one persistent collection entry per discovered species, including provenance, canonical art, and game metadata.  
**Actors:** Primary - User.  
**Trigger:** User opens the collection/archive.  
**Precondition:** User has a verified authenticated session.  
**Postcondition:** The user's current collection is displayed without exposing another user's private data.  
**Error states:** Unauthorized access, data service failure, missing canonical asset, empty collection.

## Operation flow

1. User requests the collection.
2. Sprout verifies the Firebase ID token and verified-email status.
3. Sprout fetches collection entries owned by the user.
4. Sprout resolves each entry to species metadata and canonical sprite reference.
5. Sprout returns a paginated result.
6. The client displays status (`VISITED` or `CAUGHT`), species, sprite, first/last seen dates, nickname, and PVE progress.
7. User may open a collection entry for details.

## Alternative flows

- **2a Unauthorized/unverified:** return 401/403 and route to login or verification UI.
- **3a Empty collection:** show an empty state with the upload action.
- **3b Persistence unavailable:** show a retriable error rather than a false empty state.
- **4a Missing sprite object:** show an explicit placeholder and log the broken asset reference.
- **7a Foreign entry ID:** return 404 without leaking ownership details.
- **A3 Battle with this avatar (added 2026-08-01, not yet implemented):** from an
  open collection entry the user selects **Battle with this avatar** and is taken
  directly into [[UC5 PVE Battle]] with that plant preselected, instead of
  returning to the archive list and re-selecting. If the entry is ineligible for
  battle, the control is disabled with the reason shown rather than failing after
  navigation.

> [!todo] A3 is a new alternative path
> Omar raised it on 2026-08-01 and Nat and Justin agreed it improves the user
> flow. It requires the use case description, the UC4 and UC5 sequence diagrams,
> and the report requirement-change table to be updated - Andrina, Omar,
> Li Xiang. See [[Final Deliverables Plan#Open items]].

## Collection rules

- Unique key `(userId, speciesId)`.
- Repeated web scans update `lastSeenAt`; they do not duplicate entries.
- Web creates `VISITED`; trusted mobile capture may promote to `CAUGHT`; status never demotes.
- Canonical sprite art is shared. Nickname, XP, history, and optional private source photo are personal.

## Related

[[UC6 Upload Plant Picture]] · [[UC5 PVE Battle]] · [[Database Schema]] · [[QA Sprite Storage and Web Cache]] · [[Final Deliverables Plan]]
