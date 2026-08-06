---
tags: [checkoff3, testing, test-plan, submission]
course: 50.003 Elements of Software Construction
team: Cohort 3 Team 2 (Sprout)
author: Zhi Feng
date: 2026-07-26
---

# Testing

This section covers the test plan and the test cases for the Sprout web platform.

---

## 1. Test Plan

### 1.1 Objectives

The plan targets three things. First, that each use case behaves as its description and
sequence diagram say, including the alternative and error flows, not only the happy path.
Second, that security boundaries hold, meaning a user cannot read another user's data and
an unverified account cannot reach protected gameplay. Third, that failures in external
services degrade safely rather than corrupting stored state.

### 1.2 Scope

In scope: UC1 Signup, UC2 Login, UC3 Reset Password, UC4 Browse Plant Avatar Archival,
UC5 Join PVE Battle, and UC8 Submit Query Ticket.

Out of scope for this checkoff, and deliberately not claimed as tested: UC6 Upload Plant
Picture, which is not implemented on the web client, and UC7 Join PVP Battle, which is
design only. Live email delivery to an external inbox is also out of scope because the
sending domain is not verified.

### 1.3 Integration testing strategy

Two strategies are used, one per tier, chosen because the two tiers have different shapes.

**Backend: call graph bottom up.** The server is a layered call graph where routes call
services, and services call repositories. Testing bottom up means the battle engine and the
Firestore repositories are proven first, then the HTTP routes that depend on them. By the
time a route is tested, everything beneath it is already trusted, so a route failure points
at the route. Repository tests run against the Firestore Emulator rather than a mock,
because the behaviour that matters most, transactions and atomic writes, is exactly what a
mock would fake.

**Frontend: top down from the caller side.** React pages are driven by user events, not by
being called from below, so bottom up has little meaning. Pages are rendered whole with a
real router and real child components, and only the network boundary is stubbed. This
proves the integration between page, router, and context, which is where defects actually
appeared.

**Property based testing** covers the battle engine. The engine has invariants that no
finite example set can express, such as damage never being negative and health never
exceeding its maximum, so `fast-check` generates cases instead of enumerating them. This
was chosen after a real defect where a negative damage value healed the opponent.

### 1.4 Test levels

| Level | What it covers | Where |
|---|---|---|
| Unit | Pure logic: battle engine, catalog, eligibility rules | `battle-engine`, `battle-catalog`, `battle-eligibility` |
| Property | Engine invariants under generated input | `battle-engine.property` |
| Integration (server) | Route through service to repository, against the emulator | `auth`, `query`, `battle-api`, `avatar-api`, `admin-api` |
| Integration (client) | Page with real router and context, network stubbed | `BattlePage`, `ArchivePage`, `LoginPage`, `AdminPage` |
| Configuration | Runtime guards, for example that no SQL path can load | `firestore-only-runtime`, `app-config` |

### 1.5 Environment and tooling

| Tier | Tools |
|---|---|
| Server | Jest, Supertest, Firebase Firestore Emulator, fast-check |
| Client | Vitest, React Testing Library, jsdom |
| CI | GitHub Actions, Ubuntu runner, Node 22 |

Tests never touch the production Firestore project. Server suites run against the emulator
under project id `sprout-test`. Environment variables are reset in `tests/setup-env.ts` so
that a developer's local `.env` cannot change a result, a defect that was found and fixed
during this checkoff.

### 1.6 Test data

Data is created per test rather than shared, so suites do not depend on execution order.
Battle randomness is seeded, so a battle test that passes once passes every time. Demo
archive records are generated from a fixed template set of five species, which lets the
archive tests assert exact counts.

### 1.7 Continuous integration

`.github/workflows/tests.yml` runs eight command groups on every push and every pull
request to `main`, split across a server job and a client job.

| Group | Suites | Emulator |
|---|---|---|
| 1 | battle eligibility, battle catalog | No |
| 2 | battle repository, avatar HTTP API | Yes |
| 3 | PVE HTTP API | Yes |
| 4 | battle engine unit and property, demo archive | Yes |
| 7 | admin API, auth, query, email | Yes |
| 5 | BattlePage, AppHeader navigation lock | No |
| 6 | ArchivePage | No |
| 8 | Login, Signup, Admin pages | No |

The groups run the same commands locally and in CI, so a local pass and a CI pass mean the
same thing.

**Entry criteria.** Code compiles, TypeScript check passes.
**Exit criteria.** All eight groups green. A merge to `main` is blocked otherwise.

### 1.8 Timeline

| Date | Activity | Status |
|---|---|---|
| 11 to 14 Jul | Unit suites: battle engine, catalog, eligibility | Done |
| 15 to 18 Jul | Repository integration against the emulator | Done |
| 19 to 21 Jul | Server route integration: auth, query, avatar, battle | Done |
| 22 to 23 Jul | Client page integration: Archive, Battle | Done |
| 24 Jul | CI pipeline authored and stabilised | Done |
| 25 Jul | Google sign-in and admin dashboard suites | Done |
| 25 Jul | Regression after UC8 and UC4 realignment | Done |
| 26 Jul | Battle surface repair, client regression re-run | Done |
| Before demo | End to end browser walkthrough, manual | Planned |

### 1.9 Risks and gaps

Stated plainly rather than left implied.

| Gap | Effect | Mitigation |
|---|---|---|
| No end to end browser automation | Integration level only, real browser navigation unproven | Manual walkthrough before the demo |
| Live email delivery untested | UC1 and UC8 notification paths unproven in production | Delivery failure paths are tested; the app is proven to survive them |
| UC6 and UC7 untested | Two use cases carry no evidence | Both are declared not implemented rather than claimed |
| Single Firestore emulator port | Suites cannot run in parallel locally | CI runs groups sequentially with `--runInBand` |

---

## 2. Test Cases

### 2.1 Inventory

| Tier | Files | Test cases |
|---|---|---|
| Server | 23 | 217 |
| Client | 10 | 76 |
| **Total** | **33** | **293** |

### 2.2 Traceability

| Use case | Server suite | Client suite |
|---|---|---|
| UC1 Signup | `auth.test.ts`, `email.test.ts` | `SignupPage`, `VerifyEmailPage` |
| UC2 Login | `auth.test.ts` | `LoginPage`, `ProtectedRoute` |
| UC3 Reset Password | `auth.test.ts` | `LoginPage` |
| UC4 Archive | `avatar-api.test.ts`, `avatar-demo.test.ts` | `ArchivePage` |
| UC5 PVE Battle | `battle-api`, `battle-engine`, `battle-repository` | `BattlePage` |
| UC8 Query Ticket | `query.test.ts`, `email.test.ts` | `ContactPage` |

### 2.3 Selected test cases

Cases below are real tests taken from the suites, not illustrative examples. Result column
provenance is given in section 2.4.

#### UC1 Signup

| ID | Test case | Expected | Result |
|---|---|---|---|
| TC-UC1-01 | Sign up with valid details | Firebase user, local profile, and verification email payload created | Pass |
| TC-UC1-02 | Sign up when email delivery fails (alt flow) | Account is kept, recovery is reported, signup does not roll back | Pass |
| TC-UC1-03 | Sign up with an already registered email | 409 Conflict | Pass |
| TC-UC1-04 | Sign up with a display name already taken | 409 Conflict | Pass |
| TC-UC1-05 | Sign up with malformed email and weak password | 400 with both violations | Pass |
| TC-UC1-06 | Display name at the 50 character boundary | Accepted at 50, rejected beyond | Pass |
| TC-UC1-07 | Resend verification, four times in 15 minutes | Fourth request is rate limited | Pass |
| TC-UC1-08 | Resend from one account across changing IPs | Quota follows the account, not the IP | Pass |
| TC-UC1-09 | Resend for an already verified account | No send, explicit no-send response | Pass |
| TC-UC1-10 | Unauthenticated resend abuse, 21 requests per IP | Capped at 20 per 15 minutes | Pass |

#### UC2 Login

| ID | Test case | Expected | Result |
|---|---|---|---|
| TC-UC2-01 | Load profile with a valid verified ID token | Profile returned, last login recorded | Pass |
| TC-UC2-02 | Request with missing, invalid, or unverified token | Rejected in all three cases | Pass |
| TC-UC2-03 | Login and logout timestamps | Both recorded readably on the profile | Pass |
| TC-UC2-04 | Send `x-dev-uid` while `AUTH_DEV_BYPASS` is on | Rejected, bypass header cannot authenticate | Pass |
| TC-UC2-05 | Send `x-dev-uid` while `DEMO_AUTH_BYPASS` is on | Rejected | Pass |

#### UC3 Reset Password

| ID | Test case | Expected | Result |
|---|---|---|---|
| TC-UC3-01 | Request reset for a known and an unknown email | Identical generic 200, no account enumeration | Pass |
| TC-UC3-02 | Timing of known versus unknown request | One bcrypt hash performed in both, no timing leak | Pass |
| TC-UC3-03 | Reset with a valid OTP | Password changed, OTP cleared | Pass |
| TC-UC3-04 | Two parallel requests consuming one OTP | Exactly one succeeds | Pass |
| TC-UC3-05 | Five wrong OTP attempts | OTP invalidated after the fifth | Pass |
| TC-UC3-06 | Five concurrent wrong attempts | Atomically invalidates one issuance, no double spend | Pass |
| TC-UC3-07 | Stale expired request against a freshly resent OTP | Stale request cannot clear the new OTP | Pass |
| TC-UC3-08 | Reuse of a recent password | Rejected by password history | Pass |
| TC-UC3-09 | Firebase update fails after OTP claim | OTP stays consumed, no silent retry window | Pass |
| TC-UC3-10 | Email provider rejects delivery | Generic 200 preserved, failure logged in controlled form | Pass |

#### UC4 Browse Plant Avatar Archival

| ID | Test case | Expected | Result |
|---|---|---|---|
| TC-UC4-01 | Load archive as a new verified user | Empty first page | Pass |
| TC-UC4-02 | Load archive without authentication | 401, no archive data exposed | Pass |
| TC-UC4-03 | Load archive containing another user's records | Only caller-owned avatars listed | Pass |
| TC-UC4-04 | Request another user's avatar detail | Same 404 as a missing record, no existence leak | Pass |
| TC-UC4-05 | Archive with more than 100 records | All owned avatars loaded across pages | Pass |
| TC-UC4-06 | Record carrying habitat and conservation status | Both shown in the detail panel (R4) | Pass |
| TC-UC4-07 | Record without those fields | Facts list omitted entirely, no empty labels | Pass |
| TC-UC4-08 | Sprite image fails to load | Falls back to the CSS rendered plant | Pass |
| TC-UC4-09 | Remove demo plants | Collected plants preserved | Pass |
| TC-UC4-10 | Archive request fails | Retry control shown | Pass |

#### UC5 Join PVE Battle

| ID | Test case | Expected | Result |
|---|---|---|---|
| TC-UC5-01 | Start a battle without a verified token | Rejected | Pass |
| TC-UC5-02 | Start with an owned avatar | Session created, taxonomy preserved, opponent intent redacted | Pass |
| TC-UC5-03 | Start with a foreign or expired avatar | Same 404 for missing, foreign, and expired | Pass |
| TC-UC5-04 | Submit an unknown move | Rejected without advancing persisted state | Pass |
| TC-UC5-05 | Two requests for the same turn | One resolves, other gets a redacted stale snapshot | Pass |
| TC-UC5-06 | Battle reaches a terminal state | Progression and reward persisted exactly once | Pass |
| TC-UC5-07 | Abandon a match | Abandoned once, no progression applied | Pass |
| TC-UC5-08 | Repository failure during a battle | Raw repository errors not exposed to the client | Pass |
| TC-UC5-09 | Rate limit key isolation between users | Only accepted attempts counted, keys isolated per user | Pass |
| TC-UC5-10 | Engine invariants under generated input | Damage never negative, health never above maximum | Pass |

#### UC8 Submit Query Ticket

| ID | Test case | Expected | Result |
|---|---|---|---|
| TC-UC8-01 | Submit a valid ticket | 201 with reference `SPR-YYYYMMDD-NNNN`, row persisted | Pass |
| TC-UC8-02 | Submit several tickets on one day | Daily sequence increments, never duplicates | Pass |
| TC-UC8-03 | Submit with a missing required field | 400 | Pass |
| TC-UC8-04 | Submit the full UC8 field set with organisation | Accepted (R3) | Pass |
| TC-UC8-05 | Submit without a subject | 400, subject is required (R3) | Pass |
| TC-UC8-06 | Submit without organisation | Accepted, organisation is optional (R3) | Pass |
| TC-UC8-07 | Subject beyond the documented limit | 400 | Pass |
| TC-UC8-08 | Message over 2000 characters | 400 | Pass |
| TC-UC8-09 | Invalid inquiry category | 400 | Pass |
| TC-UC8-10 | Email delivery fails (alt flow 5a) | Still 201, ticket still persisted | Pass |
| TC-UC8-11 | Provider rejection text contains a secret | Secret never persisted or logged | Pass |

### 2.4 Results and provenance

Being explicit about how each result was observed, since not every group was re-run
locally on the same day.

| Group | Suites | Result | Observed |
|---|---|---|---|
| 1 | eligibility, catalog | 18 of 18 passed | Local run, 26 Jul 2026 |
| 2 | battle repository, avatar API | 96 of 96 passed | Local run, 26 Jul 2026 |
| 3, 4, 7 | PVE API, engine and property, admin/auth/query/email | Passed | GitHub Actions on `main` |
| 5, 6, 8 | client pages | 76 of 76 passed | Local run, 26 Jul 2026 |

Client suites were additionally re-run after the battle surface repair on 26 July and
stayed at 76 of 76, alongside a clean TypeScript check and production build.

![Passing CI run](<../../Raw dump/check_off 3/For Writing Report/Screenshot 2026-07-25 214203.png>)

**Figure T1.** Both CI jobs green on `main`, total duration 2m 1s
(`Screenshot 2026-07-25 214203.png`).

![PR with checks passed](<../../Raw dump/check_off 3/For Writing Report/Screenshot 2026-07-25 214241.png>)

**Figure T2.** Pull request #5 merged only after four required checks passed
(`Screenshot 2026-07-25 214241.png`).

### 2.5 A defect the pipeline caught

The suites passed locally but failed in CI with
`TypeError: this._moduleMocker.clearMocksOnScope is not a function`.

The cause was a dependency conflict rather than a test defect. The monorepo root hoists
Jest 30 as a `ts-jest` peer while the server pins Jest 29, and on the Linux runner the bare
`jest` command resolved to the wrong version. The fix was to invoke the pinned binary by
path, `node node_modules/jest/bin/jest.js`, in every group.

This is the clearest argument for the pipeline. The conflict was invisible on Windows and
would have reached a teammate's machine unnoticed.

![Failing CI run](<../../Raw dump/check_off 3/For Writing Report/Screenshot 2026-07-25 213844.png>)

**Figure T3.** The failing run that exposed the version conflict
(`Screenshot 2026-07-25 213844.png`).

Read Figure T3 and Figure T1 together: a real failure, diagnosed, then green.
