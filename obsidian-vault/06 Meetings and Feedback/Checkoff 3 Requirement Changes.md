---
tags: [checkoff3, requirements, report]
updated: 2026-07-25
---

# Checkoff 3 — Changes in Requirements and Design since Project Meeting 2

> [!info] Report deliverable
> This note answers the PM3 rubric row *"Any changes in requirement and design (compared to 2nd meeting)"* (0.5%). The rubric awards full marks when changes are **clearly identified and discussed** — or, if there are none, when that is stated explicitly. Copy the tables below into the report; the rationale column is what earns the mark, not the list itself.

## Summary

There are changes in six areas: one use-case relationship, one use-case description correction, two provider/architecture decisions, and two added features. None of them change the product vision recorded at Project Meeting 2 (*Scan. Grow. Battle.* — a web platform showcasing the mobile-first Sprout product); they refine how the platform is built and demonstrated.

## 1. Requirement changes

| # | Area | At Project Meeting 2 | Now (Checkoff 3) | Why it changed |
|---|---|---|---|---|
| R1 | UC5/UC6 relationship | UC6 *Upload Plant Picture* existed only as a sub use case that `«extend»`s UC5 *Join PVE Battle* | UC6 is a **base use case** — `User` associates with it directly — **and still** `«extend»`s UC5 for the optional in-battle upload | Users must be able to upload and collect a plant without starting a battle. Modelling it only as an extension made the primary flow unreachable from the actor. |
| R2 | UC1 signup fields and error branches | Visitor enters **email and password**; alternative flows `3a` invalid/unreachable email, `3b` already registered, `5a` consent denied | Visitor enters **email, password, and display name (username)**; branches `3a` invalid email, `3b` invalid username, `3c` invalid password, `3d` already registered, `5a` authentication error | The implemented signup validates a display name and password policy separately, so the original description under-specified the real error space. The 2026-07-24 sequence diagram is authoritative; [[UC1 Signup]] was corrected to match. |
| R3 | UC8 contact form fields | Form fields: name, email, organisation (optional), subject, message, inquiry type | **Unchanged from the original description** — the interim implementation had reduced this to name/email/category/message, and the code has now been brought back in line with the documented form | An interim simplification drifted from the approved requirement. The diagram set and the original use-case description agree, so the implementation was corrected rather than the requirement. |
| R4 | UC3 reset — unknown email | System displays *"No account found with this email address"* | System returns the **same generic acknowledgement** whether or not the account exists | Security refinement: the original wording lets an attacker enumerate registered accounts. The stricter behaviour is deliberate and is documented as a known difference from the sequence diagram. |

## 2. Design and technology changes

| # | Area | At Project Meeting 2 | Now (Checkoff 3) | Why it changed |
|---|---|---|---|---|
| D1 | Authentication | Sprout-issued session token after validating credentials against the database | **Firebase Authentication** is the identity authority: the client signs in with the Firebase JS SDK, and the Express backend verifies the ID token on every protected route | Removes password handling and session-token issuance from Sprout code, and shares one identity with the mobile app. The domain-level sequence diagrams remain valid; the mapping is recorded in [[Sequence Diagram Plan#Design-to-implementation mapping]]. |
| D2 | Data store | Relational/document database, with an interim SQLite runtime | **Firestore only** | One cross-platform datastore shared with the mobile app; removes a second persistence path that was diverging from the deployed behaviour. |
| D3 | Sprite generation providers | Plant.id → Google Gemma → FLUX | Plant.id → **configured Gemini image model** → background removal → fixed 56×56 FLORENTINE24 palette quantisation | Availability and cost of the original generation stack, plus a decision to make sprite art **canonical per species** rather than per upload. UC6 remains **planned** on web — see limitations below. |
| D4 | Outbound email | Gmail SMTP from the deployed backend | **HTTPS email API (Resend)**, with SMTP retained as a configurable fallback | The deployed host blocks outbound SMTP: connections to port 587 hang until timeout, so requests stalled ~2 minutes and delivered nothing. Selected by measurement, not preference. |

## 3. Features added since Project Meeting 2

| # | Feature | Status | Evidence |
|---|---|---|---|
| F1 | UC4 archive: owner-only records, detail view, demo data controls | Implemented and tested | `CORE-I01`, `CORE-I03`, `CORE-F02` in [[Test Matrix]] |
| F2 | UC5 PVE: server-authoritative battle engine, seeded RNG, idempotent rewards | Implemented and tested | `CORE-U01`, `CORE-U02`, `CORE-I02`, `CORE-F01` |
| F3 | Google sign-in | Implemented and tested | Google asserts a verified email, so this path needs no verification email at all |
| F4 | Admin account dashboard (`/admin`) | Implemented and tested | Allowlist-gated account list and deletion; frees an email address for repeat signup testing |
| F5 | Continuous integration | Implemented | Every pull request to `main` re-runs the focused suites — see [[Testing Strategy#Timeline]] |

## 4. Scope explicitly *not* changed

- The product vision, target users, and value proposition are unchanged.
- UC7 PVP remains **planned final architecture**, as it was at Project Meeting 2. UC7a/UC7b diagrams exist; no implementation is claimed.
- The B2B advertising API and business dashboard remain deferred P2 items.

## 5. Known limitations to state openly

Declaring these is worth more than hiding them; the rubric explicitly allows existing bugs and gaps to be pointed out.

- **UC6 upload/AI pipeline is not implemented on the web platform.** It is being developed in parallel and is not merged. Archive records exist independently of it, so passing archive tests must not be read as upload evidence.
- **Live email delivery** to arbitrary addresses requires a verified sending domain. The team does not own one, so outbound mail currently uses a shared verified sender that can only reach the team's own inbox.
- **Real-browser system tests** (Playwright) and production-Firestore checks remain planned; current integration evidence uses the Firestore emulator.

## Related

[[Use Case Model]] · [[Sequence Diagram Plan]] · [[UC1 Signup]] · [[UC8 Submit Query Ticket]] · [[Test Matrix]] · [[Checkoff 3 Readiness and Development Plan]] · [[Open Questions and Inconsistencies]]
