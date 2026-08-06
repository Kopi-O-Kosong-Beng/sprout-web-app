---
tags: [checkoff3, report, submission]
course: 50.003 Elements of Software Construction
team: Cohort 3 Team 2 (Sprout)
date: 2026-07-26
---

# Sprout: Checkoff 3 Report

Sprout is a gamified biodiversity product built on one loop: scan a real plant, grow a
collectible avatar for that species, battle with it. This report covers the web platform
delivered for Project Meeting 3.

**Figure index.** Diagram files are in `Sprout_Vault/_attachments/pm3-diagrams/`.
Screenshots are in `Raw dump/check_off 3/For Writing Report/`.

---

## Requirement

The system is modelled as eight use cases across three primary actors. `Visitor` is an
unauthenticated person, `User` is an authenticated player, and `All` covers either.
Firebase Auth, the email service, and the plant identification and image generation
services are secondary actors. Internal storage and the game engine sit inside the system
boundary and are not actors.

| ID | Use case | Primary actor | Status in this checkoff |
|---|---|---|---|
| UC1 | Signup | Visitor | Implemented |
| UC2 | Login | User | Implemented, plus Google sign-in |
| UC3 | Reset Password | User | Implemented |
| UC4 | Browse Plant Avatar Archival | User | Implemented |
| UC5 | Join PVE Battle | User | Implemented |
| UC6 | Upload Plant Picture | User | Not implemented on web, developed in parallel |
| UC7 | Join PVP Battle | User | Planned, not implemented |
| UC8 | Submit Query Ticket | All | Implemented, email delivery not proven |

![Use case diagram](../_attachments/pm3-diagrams/use-case-diagram.png)

**Figure 1.** Use case diagram (`use-case-diagram.png`). Primary actors sit left of the
system boundary and secondary actors right.

### Changes in requirements since Project Meeting 2

| # | Change | Reason |
|---|---|---|
| R1 | UC6 became a base use case reachable directly by the User, and still `«extend»`s UC5 | A player should be able to collect a plant without starting a battle. Previously UC6 existed only inside PVE. |
| R2 | UC1 alternative flows split into 3a to 3d | The implementation validates display name, email format, password policy, and duplicate account separately, so one combined error branch did not describe real behaviour. |
| R3 | UC8 form gained `organisation` (optional) and `subject`, and the category became an inquiry type | The interim build had a reduced field set that had drifted from the requirement document. The requirement was restored rather than the requirement being rewritten. |
| R4 | UC4 detail view now shows habitat and conservation status | UC4 step 3 lists these fields and the archive was not displaying them. |

R1 is a genuine requirement change. R2, R3, and R4 are corrections where the build had
drifted from the agreed description.

---

## Design

The platform is three tiers. A React 19 and TypeScript client is served from Vercel. An
Express and TypeScript API runs on Render. Firebase Auth issues identity, and Firestore is
the only datastore. There is no SQL layer.

Authentication is delegated: Firebase Auth issues ID tokens, the client attaches them, and
the Express middleware verifies them with the Firebase Admin SDK. The server never mints
its own session JWT, which keeps one source of identity truth.

Classes follow a boundary, control, entity split. Routes are boundaries, services hold
control logic, and repositories own all Firestore access, so no route touches the database
directly.

![Class diagram](../_attachments/pm3-diagrams/Sprout-class-diagram-pm3.png)

**Figure 2.** Domain class diagram (`Sprout-class-diagram-pm3.png`).

Nine sequence diagrams cover the operation flows, including alternative and error paths.

| Figure | Use case | File |
|---|---|---|
| 3 | UC1 Signup | `UC1-signup-seq.png` |
| 4 | UC2 Login | `UC2-login-seq.png` |
| 5 | UC3 Reset Password | `UC3-reset-password-seq.png` |
| 6 | UC4 Browse Archive | `UC4-archive-seq.png` |
| 7 | UC5 PVE Battle | `UC5-pve-seq.png` |
| 8 | UC6 Upload Plant Picture | `UC6-upload-seq.png` |
| 9 | UC7 PVP Battle, main flow | `UC7a-pvp-seq.png` |
| 10 | UC7 PVP Battle, failure paths | `UC7b-pvp-failures-seq.png` |
| 11 | UC8 Submit Query Ticket | `UC8-query-ticket-seq.png` |

Two design rules carry through the diagrams. Every flow ends with a response back to the
initiating actor, and every external call has a defined failure branch rather than an
assumed success.

---

## Implementation Challenges

Five problems cost real time. Each is recorded with the evidence that diagnosed it.

**1. The host blocks outbound SMTP.** Signup verification emails never arrived, and the
request hung for exactly two minutes before failing. The Gmail App Password was proven
working locally, which ruled out credentials. Render's free tier blocks outbound
connections on port 587. The fix was to replace SMTP with the Resend HTTPS API on port
443, added as a third `EMAIL_MODE` alongside the existing console and SMTP modes.

**2. Email delivery is still not proven.** Resend only sends to arbitrary recipients from a
verified domain. Without one, the shared sandbox sender can reach only the account owner's
own address, so no test message reached the team inbox. Domain verification needs a
purchased domain, which was out of scope.

![Resend add domain](<../../Raw dump/check_off 3/For Writing Report/Screenshot 2026-07-25 183754.png>)

**Figure 12.** Resend domain verification requirement (`Screenshot 2026-07-25 183754.png`).

![Resend no emails sent](<../../Raw dump/check_off 3/For Writing Report/Screenshot 2026-07-25 214021.png>)

**Figure 13.** Resend dashboard showing no delivered messages
(`Screenshot 2026-07-25 214021.png`). This is why the report does not claim UC1 and UC8
email delivery as working.

**3. Quoted environment values broke authentication in production.** The local `.env` file
wrapped Firebase values in double quotes. Vite strips those when reading a file, but the
Vercel dashboard passes the value literally, so the deployed client built a malformed
Firebase config. Every ID token was then rejected by `verifyIdToken`, which returned 401 on
the archive and also broke logout. The fix was to strip quotes from every deployed value.

![401 on archive](<../../Raw dump/check_off 3/For Writing Report/Screenshot 2026-07-25 172723.png>)

**Figure 14.** Repeated 401 responses on the deployed archive
(`Screenshot 2026-07-25 172723.png`).

![Vercel environment variables](<../../Raw dump/check_off 3/For Writing Report/Screenshot 2026-07-25 163016.png>)

**Figure 15.** Vercel environment variables after correction
(`Screenshot 2026-07-25 163016.png`).

**4. An environment import replaced every variable instead of merging.** Importing a
partial secrets file into Render deleted the variables that were not in it, including
`FIREBASE_SERVICE_ACCOUNT_JSON`, which took the backend down. The recovery was to rebuild
a complete twenty variable file and import that.

![Render environment variables](<../../Raw dump/check_off 3/For Writing Report/Screenshot 2026-07-25 173952.png>)

**Figure 16.** Render environment reduced to four variables after the import
(`Screenshot 2026-07-25 173952.png`).

**5. Two Jest versions in one workspace broke CI.** The suites passed locally and failed on
GitHub Actions with `TypeError: this._moduleMocker.clearMocksOnScope is not a function`.
The monorepo root hoists Jest 30 as a `ts-jest` peer while the server pins Jest 29, and on
Linux the bare `jest` command resolved to the wrong one. The fix was to invoke the pinned
binary by path, `node node_modules/jest/bin/jest.js`.

![Failing CI run](<../../Raw dump/check_off 3/For Writing Report/Screenshot 2026-07-25 213844.png>)

**Figure 17.** The failing CI run that exposed the version conflict
(`Screenshot 2026-07-25 213844.png`).

---

## Testing

**Strategy.** Backend integration is call graph bottom up: engine and repository units
first, then the HTTP routes that call them, against the Firestore Emulator rather than
mocks. Frontend integration is top down from the caller side, rendering real pages with a
real router and stubbing only the network boundary. Property based tests cover the battle
engine, where the invariants matter more than any single example, such as damage never
being negative.

**Tooling.** Server uses Jest, Supertest, the Firestore Emulator, and fast-check across 23
test files. Client uses Vitest, React Testing Library, and jsdom across 10 test files.

**Continuous integration.** `.github/workflows/tests.yml` runs eight command groups on
every push and pull request to `main`, split into a server job and a client job. The groups
mirror the documented evidence commands, so the same commands run locally and in CI.

Merges are gated on those checks passing.

![PR with checks passed](<../../Raw dump/check_off 3/For Writing Report/Screenshot 2026-07-25 214241.png>)

**Figure 18.** Pull request #5 merged with four required checks passing
(`Screenshot 2026-07-25 214241.png`).

![Passing CI run](<../../Raw dump/check_off 3/For Writing Report/Screenshot 2026-07-25 214203.png>)

**Figure 19.** Both CI jobs green on `main` in 2m 1s
(`Screenshot 2026-07-25 214203.png`).

Figures 17 and 19 together are the useful pair: a real failure, diagnosed, then green.

**Current results.** Client suites pass 76 of 76, verified 25 July 2026 alongside a clean
TypeScript check and production build. Server suites pass in CI as shown in Figure 19.

**Not proven.** Stating these plainly rather than implying wider coverage:

- Live email delivery to an external inbox, for the reason in Challenge 2.
- UC6 upload and the AI pipeline, which are not implemented on the web client.
- UC7 PVP, which is design only.
- End to end browser automation. Coverage is integration level, not Playwright or Cypress.

---

## Feature Progress Records

Work was tracked as one pull request per feature, each gated on CI. Six pull requests were
raised for this checkoff.

| PR | Feature | Status |
|---|---|---|
| #1 | Firestore only runtime, auth and email system, Archive and PVE, focused tests, CI | Merged |
| #2 | Resend HTTPS email transport for hosts that block SMTP | Merged |
| #3 | Google sign-in and admin account dashboard | Merged |
| #4 | Align contact form and archive detail with the diagrams (R3, R4) | Merged |
| #5 | Field guide redesign of the web client | Merged |
| #6 | Repair the battle surface | Open at time of writing |

![Pull request history](<../../Raw dump/check_off 3/For Writing Report/Screenshot 2026-07-25 214324.png>)

**Figure 20.** Pull request history (`Screenshot 2026-07-25 214324.png`).

![PR 6 open](<../../Raw dump/check_off 3/For Writing Report/Screenshot 2026-07-25 214922.png>)

**Figure 21.** Pull request #6 with CI running (`Screenshot 2026-07-25 214922.png`).

**Scope note.** This repository holds the web platform, and its commit history shows a
single contributor. Other team members' work sits in the mobile and pipeline repositories
and is recorded there. Per member records for this checkoff should be read together with
those repositories rather than from this one alone.

> **[TEAM TO FILL]** Add one row per member here: name, feature owned, repository, and
> demo video timestamp.

---

## Sustainability, Diversity and Inclusion

**Sustainability.** The product goal is environmental: turning passive foot traffic through
gardens and trails into lasting awareness of species. UC4 pairs each collected plant with
its habitat and conservation status, so progression teaches conservation rather than only
rewarding collection. Technically, the stack is deliberately light. The client ships 140 KB
gzipped, the backend runs on a free tier, and Firestore is queried with paging rather than
full collection reads, which keeps compute and transfer low.

**Diversity.** The domain is biodiversity itself. Species are stored with full taxonomy,
family, habitat, and IUCN style conservation status, so the archive represents range rather
than a fixed cast of characters. Because avatars derive from a stable species identifier,
the catalogue grows with whatever a player actually finds.

**Inclusion.** Accessibility was treated as a build requirement, not a later audit:

- Colour meets WCAG 2.1 AA. Text tokens were chosen in OKLCH and verified at 4.5:1 or
  better against their backgrounds.
- Semantics carry state to assistive technology. The interface uses 76 ARIA attributes,
  including `role="progressbar"` with live values on health meters, `aria-live` regions for
  turn results and errors, and `aria-pressed` on selection controls.
- Motion is optional. Four `prefers-reduced-motion` blocks replace movement with a static
  or crossfade alternative.
- Layout is responsive down to 390 px with no horizontal scrolling, verified by screenshot
  at 390, 768, and 1280 px.
- The interface is usable without colour alone. Battle opponents differ in silhouette and
  form, not only hue, and every status message carries text.

**Ethics note.** UC3 password reset always returns a generic success response whether or
not the email exists, which prevents the reset form being used to enumerate registered
accounts.
