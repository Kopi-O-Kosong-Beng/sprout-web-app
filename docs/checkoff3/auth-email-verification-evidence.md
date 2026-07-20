# Checkoff 3 Auth and Email Verification Evidence

**Recorded:** 2026-07-21 (Asia/Singapore)
**Commit under test:** `a28e6e26eecf19e8d0fa2a1fc0d6fd9b1c0d2b97`
**Required runtime:** Node `22.x`
**Fresh verification runtime:** disposable Node `v22.23.1`; active system shell remains Node `v24.14.0`
**Configuration boundary:** the automated gate ran without Firebase web credentials, Gmail App Password, authorized deployed domain, controlled inbox, or live-provider calls. A supplementary live Storage Admin preflight was run afterward with an existing local service account; no credential value was printed or retained.

## Automated Command Gate

The commands below are the logical npm commands required by the gate. Duration is fresh wall-clock time measured around each complete command on 2026-07-21.

| Logical npm command | Actual result | Duration |
| --- | --- | ---: |
| `npm.cmd run typecheck -w server` | AUTOMATED PASS (exit 0): `tsc --noEmit` | 2.852s |
| `npm.cmd test -w server` | AUTOMATED PASS (exit 0): Jest 9 suites, 79 tests, 0 snapshots | 6.867s |
| `npm.cmd test -w client` | AUTOMATED PASS (exit 0): Vitest 6 files, 18 tests | 11.781s |
| `npm.cmd run lint -w client` | AUTOMATED PASS (exit 0): 0 errors, 3 existing Fast Refresh warnings | 3.356s |
| `npm.cmd run build -w client` | AUTOMATED PASS (exit 0): TypeScript and Vite; 109 modules transformed | 15.621s |
| `npm.cmd test` | AUTOMATED PASS (exit 0): server 9 suites/79 tests; client 6 files/18 tests | 46.090s |

The three lint warnings are `react(only-export-components)`: `client/src/context/AuthContext.tsx:43`, `client/src/context/AuthContext.tsx:49`, and `client/src/components/common/PlantVisuals.tsx:19`.

### Actual Node 22 Invocation

The first five logical commands used this direct wrapper form, with the logical arguments appended:

```powershell
& 'C:\Users\zhife\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\bin\node.exe' 'D:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' <logical npm arguments>
```

The root command needed recursive npm proof. A disposable `npm.cmd` was created outside the repository at `C:\Users\zhife\AppData\Local\Temp\sprout-final-npm22-shim-a28e6e2\npm.cmd`. Its complete contents were:

```cmd
@echo off
echo node=v22.23.1
"C:\Users\zhife\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\bin\node.exe" "D:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" %*
```

Only that shim directory was prepended for the root run:

```powershell
$env:Path = 'C:\Users\zhife\AppData\Local\Temp\sprout-final-npm22-shim-a28e6e2;' + $env:Path
npm.cmd test
```

`Get-Command npm.cmd` resolved to the temp shim. The root run printed `node=v22.23.1` from the shim for all five npm invocations: `test`, `run test:server`, `test -w server`, `run test:client`, and `test -w client`. This proves the recursive npm calls did not fall through to system Node 24. The shim was removed after the run.

## Evidence Audit

| ID | Use case | Actual result | Status | Commit under test | Owner | Evidence path/test file |
| --- | --- | --- | --- | --- | --- | --- |
| AUTH-U01 | UC1: signup input and display-name boundaries | Signup validation, Firebase-user/profile creation, and 50-character/allowed-character boundaries passed in the server suite. | AUTOMATED PASS | `a28e6e2` | Zhi Feng/backend | `server/tests/auth.test.ts:179` |
| AUTH-U02 | UC1: recoverable verification delivery and resend abuse controls | Strict unverified bearer auth precedes the UID-keyed 3 requests/15 minutes quota; account isolation across IP/NAT and the separate 20 requests/15 minutes pre-auth IP cap passed. | AUTOMATED PASS | `a28e6e2` | Zhi Feng/backend | `server/tests/auth.test.ts:360`, `server/tests/auth.test.ts:473`, `server/tests/auth.test.ts:504`, `server/tests/auth.test.ts:531`, `server/tests/auth.test.ts:556` |
| AUTH-I01 | UC1/UC2: Firebase action code, profile refresh, protected access | Firebase/admin and client action-code behavior passed with fakes; live action-code completion and deployed authorized-domain access were not run. | AUTOMATED PASS; LIVE BLOCKED | `a28e6e2` | team | `server/tests/auth.test.ts:179`, `client/src/pages/VerifyEmailPage.test.tsx:49`, `client/src/components/common/ProtectedRoute.test.tsx:40` |
| AUTH-U03 | UC2: invalid, unverified, no-email, and verified auth states | Normal backend protection requires `email_verified === true`, including tokens without an email claim; strict resend/session paths still accept authenticated unverified tokens. Frontend guards also passed. | AUTOMATED PASS | `a28e6e2` | team | `server/tests/auth.test.ts:360`, `server/tests/auth.test.ts:628`, `client/src/pages/LoginPage.test.tsx:40`, `client/src/components/common/ProtectedRoute.test.tsx:40` |
| AUTH-U04 | UC3: wrong/expired OTP and five-attempt invalidation | OTP expiry, atomic one-time consume, stale-request isolation, password reuse, sequential fifth-attempt invalidation, and five concurrent wrong attempts against one issuance passed. | AUTOMATED PASS | `a28e6e2` | Zhi Feng/backend | `server/tests/auth.test.ts:731`, `server/tests/auth.test.ts:1131` |
| AUTH-I02 | UC3: reset request anti-enumeration, email OTP, reset, new login | Known/unknown valid emails returned the exact generic 200 body and performed one bcrypt hash each; unknown PII was not persisted or mailed, provider latency was decoupled, and provider/persistence failures emitted controlled codes only. Live SMTP inbox receipt and login with the new password were not run. | AUTOMATED PASS; LIVE BLOCKED | `a28e6e2` | Zhi Feng/backend | `server/tests/auth.test.ts:731`, `server/tests/auth.test.ts:753`, `server/tests/auth.test.ts:778`, `server/tests/auth.test.ts:804`, `server/tests/background-dispatch.test.ts:3`, `client/src/pages/LoginPage.test.tsx:59` |
| EMAIL-U01 | Email failure secrecy and preflight reporting | Background dispatch rejection, ticket provider/persistence failures, and SMTP verification rejection did not expose injected secret text; explicit missing-env diagnostics remained intact. | AUTOMATED PASS | `a28e6e2` | Zhi Feng/backend | `server/tests/background-dispatch.test.ts:3`, `server/tests/query.test.ts:155`, `server/tests/query.test.ts:180`, `server/tests/email.test.ts:214` |
| TKT-U01 | UC8: submitter/admin notification outcomes | Pairwise submitter failure, admin failure, and dual failure each attempted both notifications and persisted independent statuses plus controlled reason codes only. | AUTOMATED PASS | `a28e6e2` | Zhi Feng/backend | `server/tests/query.test.ts:118`, `server/tests/query.test.ts:155` |
| TKT-I01 | UC8: atomic reference and persisted ticket/outcomes | Supertest plus repository fakes returned 201, generated a unique reference, and persisted the ticket/outcome state; live recipient/admin delivery was not run. | AUTOMATED PASS; LIVE NOT RUN | `a28e6e2` | Zhi Feng/backend | `server/tests/query.test.ts:47`, `server/tests/ticket-repo-sqlite.test.ts`, `server/tests/ticket-repo-firestore.test.ts` |
| FE-U01 | UC1/UC2 frontend verification and protected-route states | Component tests passed. The prior local smoke was not repeated in this fix wave, and no deployed Firebase flow was run. | AUTOMATED PASS; LOCAL/DEPLOYED NOT RUN THIS WAVE | `a28e6e2` | FE | `client/src/pages/SignupPage.test.tsx:19`, `client/src/pages/VerifyEmailPage.test.tsx:49`, `client/src/components/common/ProtectedRoute.test.tsx:40` |
| FE-U02 | UC8 honest notification copy | The ContactPage flow confirms ticket storage and describes submitter/team notification delivery as attempted rather than guaranteed. | AUTOMATED PASS | `a28e6e2` | FE | `client/src/pages/ContactPage.test.tsx:18` |

## Password Reset Timing Boundary

The anti-enumeration work is best-effort, not perfect side-channel elimination. For every schema-valid email, the service performs the same repository lookup, generates an OTP, and performs one bcrypt hash; both known and unknown requests return the exact same generic 200 JSON body. Unknown addresses are neither mailed nor persisted, and SMTP/provider latency is excluded from the response by a consumed in-memory dispatcher whose rejection path logs only a controlled code.

Observable timing can still differ because a known account must persist its OTP hash before the response while an unknown account performs no write, and datastore lookup/cache behavior is outside this equalization. The in-memory dispatcher is also non-durable: a process restart can lose queued delivery, which is accepted for Checkoff 3's long-running Render process only.

## Local Browser Smoke Checks

No browser smoke was run for commit `a28e6e2`. The earlier loopback smoke at `cd7e836` is historical context only and is not claimed as fresh evidence for this fix wave. No local ports or browser processes were started.

## Credential-Free Expected Blockers

These preflights intentionally verified fail-closed behavior only. They are not live provider evidence.

| Logical command | Safe configuration | Result | Duration |
| --- | --- | --- | ---: |
| `npm.cmd run check:email -w server` | `EMAIL_MODE=smtp` with `SMTP_PASS` absent | EXPECTED BLOCKED (exit 1): missing `SMTP_PASS`; no SMTP connection attempted | 2.268s |
| `npm.cmd run check:storage -w server` | `FIREBASE_STORAGE_BUCKET` absent | EXPECTED BLOCKED (exit 1): missing bucket before Firebase initialization | 2.488s |

## Live Firebase Storage Preflight

At `2026-07-21 01:49 +08:00`, the backend preflight ran under Node `v22.23.1` against `sprout-dev-66f08.firebasestorage.app` using an existing local Firebase Admin service account. It wrote a unique tiny `.preflight/` object, read and compared the exact payload, and deleted the object before returning:

```text
[storage-check] bucket=sprout-dev-66f08.firebasestorage.app writeReadDelete=true
```

**Status:** LIVE BACKEND ADMIN PASS. This proves backend credential and bucket write/read/delete access. Firebase Admin bypasses Storage Security Rules, so this does not prove direct client access or rule behavior. The current deny-all rules remain a safe backend-only default, and `STORAGE_MODE=local` remains deployed until the application Storage adapter is implemented and integrated.

## Live External Evidence

| Use case | Status | Missing evidence/blocker |
| --- | --- | --- |
| UC1 signup and email verification | BLOCKED / NOT RUN | Requires Firebase client/admin configuration, a controlled inbox, live SMTP, and successful `applyActionCode`; no action code was fabricated. |
| UC2 verified login and protected access | BLOCKED / NOT RUN | Requires the deployed origin in Firebase authorized domains and a real verified account. |
| UC3 password reset and login with the new password | BLOCKED / NOT RUN | Requires live OTP inbox delivery and a controlled Firebase account. |
| UC8 Contact Us persistence plus submitter/admin email | BLOCKED / NOT RUN | Requires live SMTP, controlled recipient/admin inboxes, and configured production persistence. |
| Firebase Storage | BACKEND ADMIN PASS; CLIENT RULES/APP ADAPTER NOT RUN | Live write/read/delete cleanup passed for `sprout-dev-66f08.firebasestorage.app`; direct client rules and the not-yet-implemented application Storage adapter remain untested. |

No package manifest or lockfile changed in this fix wave. No secrets, screenshots, raw command logs, private recipient addresses, or temporary shim files are retained in this evidence.
