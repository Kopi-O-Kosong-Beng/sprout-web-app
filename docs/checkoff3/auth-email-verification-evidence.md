# Checkoff 3 Auth and Email Verification Evidence

**Recorded:** 2026-07-21 (Asia/Singapore)
**Commit under test:** `cd7e8366d2001f49909cf166347d593c8c0e148a`
**Required runtime:** Node `22.x`
**Fresh verification runtime:** disposable Node `v22.23.1`; active system shell remains Node `v24.14.0`
**Configuration boundary:** no Firebase web credentials, Firebase Admin credentials, Gmail App Password, authorized deployed domain, controlled inbox, or Firebase Storage bucket was available.

## Automated Command Gate

The commands below are the logical npm commands required by the gate. Duration is fresh wall-clock time measured around each complete command on 2026-07-21.

| Logical npm command | Actual result | Duration |
| --- | --- | ---: |
| `npm.cmd run typecheck -w server` | AUTOMATED PASS (exit 0): `tsc --noEmit` | 32.390s |
| `npm.cmd test -w server` | AUTOMATED PASS (exit 0): Jest 7 suites, 63 tests, 0 snapshots | 43.227s |
| `npm.cmd test -w client` | AUTOMATED PASS (exit 0): Vitest 5 files, 17 tests | 24.415s |
| `npm.cmd run lint -w client` | AUTOMATED PASS (exit 0): 0 errors, 3 existing Fast Refresh warnings | 4.442s |
| `npm.cmd run build -w client` | AUTOMATED PASS (exit 0): TypeScript and Vite; 109 modules transformed | 20.497s |
| `npm.cmd test` | AUTOMATED PASS (exit 0): server 7 suites/63 tests; client 5 files/17 tests | 97.406s |

The three lint warnings are `react(only-export-components)`: `client/src/context/AuthContext.tsx:43`, `client/src/context/AuthContext.tsx:49`, and `client/src/components/common/PlantVisuals.tsx:19`.

### Actual Node 22 Invocation

The first five logical commands used this direct wrapper form, with the logical arguments appended:

```powershell
& 'C:\Users\zhife\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\bin\node.exe' 'D:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' <logical npm arguments>
```

The root command needed recursive npm proof. A disposable `npm.cmd` was created outside the repository at `C:\Users\zhife\AppData\Local\Temp\sprout-task7-npm22-shim-cd7e836\npm.cmd`. Its dispatch command was:

```cmd
"C:\Users\zhife\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\bin\node.exe" "D:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" %*
```

Only that shim directory was prepended for the root run:

```powershell
$env:Path = 'C:\Users\zhife\AppData\Local\Temp\sprout-task7-npm22-shim-cd7e836;' + $env:Path
npm.cmd test
```

`Get-Command npm.cmd` resolved to the temp shim. The root run printed `node=v22.23.1` from the shim for all five npm invocations: `test`, `run test:server`, `test -w server`, `run test:client`, and `test -w client`. This proves the recursive npm calls did not fall through to system Node 24. The shim was removed after the run.

## Evidence Audit

| ID | Use case | Actual result | Status | Commit under test | Owner | Evidence path/test file |
| --- | --- | --- | --- | --- | --- | --- |
| AUTH-U01 | UC1: signup input and display-name boundaries | Signup validation, Firebase-user/profile creation, and 50-character/allowed-character boundaries passed in the server suite. | AUTOMATED PASS | `cd7e836` | Zhi Feng/backend | `server/tests/auth.test.ts:174` |
| AUTH-U02 | UC1: recoverable verification delivery and resend limit | Delivery-failure recovery, strict bearer-token handling, resend for unverified users, and the 3 requests/15 minutes limit passed. | AUTOMATED PASS | `cd7e836` | Zhi Feng/backend | `server/tests/auth.test.ts:209`, `server/tests/auth.test.ts:310` |
| AUTH-I01 | UC1/UC2: Firebase action code, profile refresh, protected access | Firebase/admin and client action-code behavior passed with fakes; live action-code completion and deployed authorized-domain access were not run. | AUTOMATED PASS; LIVE BLOCKED | `cd7e836` | team | `server/tests/auth.test.ts:174`, `client/src/pages/VerifyEmailPage.test.tsx:49`, `client/src/components/common/ProtectedRoute.test.tsx:40` |
| AUTH-U03 | UC2: invalid, unverified, and verified auth states | Backend token rejection/profile access and frontend signed-out/unverified/verified route guards passed. | AUTOMATED PASS | `cd7e836` | team | `server/tests/auth.test.ts:470`, `client/src/pages/LoginPage.test.tsx:40`, `client/src/components/common/ProtectedRoute.test.tsx:40` |
| AUTH-U04 | UC3: wrong/expired OTP and five-attempt invalidation | OTP expiry, atomic one-time consume, stale-request isolation, password reuse, and exact fifth-attempt invalidation passed. | AUTOMATED PASS | `cd7e836` | Zhi Feng/backend | `server/tests/auth.test.ts:623` |
| AUTH-I02 | UC3: request, email OTP, reset, new login | Supertest/Firebase-fake reset integration passed; live SMTP inbox receipt and login with the new password were not run. | AUTOMATED PASS; LIVE BLOCKED | `cd7e836` | Zhi Feng/backend | `server/tests/auth.test.ts:623`, `client/src/pages/LoginPage.test.tsx:59` |
| TKT-U01 | UC8: submitter/admin notification outcomes | Pairwise submitter failure, admin failure, and dual failure each attempted both notifications and persisted independent outcome states. | AUTOMATED PASS | `cd7e836` | Zhi Feng/backend | `server/tests/query.test.ts:92` |
| TKT-I01 | UC8: atomic reference and persisted ticket/outcomes | Supertest plus repository fakes returned 201, generated a unique reference, and persisted the ticket/outcome state; live recipient/admin delivery was not run. | AUTOMATED PASS; LIVE NOT RUN | `cd7e836` | Zhi Feng/backend | `server/tests/query.test.ts:34`, `server/tests/ticket-repo-sqlite.test.ts`, `server/tests/ticket-repo-firestore.test.ts` |
| FE-U01 | UC1/UC2 frontend verification and protected-route states | Component tests passed; local `/login`, `/signup`, `/verify-email`, and signed-out `/archive` smoke checks rendered/redirected as expected. No deployed Firebase flow was run. | AUTOMATED PASS + LOCAL SMOKE PASS; DEPLOYED NOT RUN | `cd7e836` | FE | `client/src/pages/SignupPage.test.tsx:19`, `client/src/pages/VerifyEmailPage.test.tsx:49`, `client/src/components/common/ProtectedRoute.test.tsx:40` |

## Local Browser Smoke Checks

The backend and client ran under Node 22 on loopback ports `3011` and `5179` with SQLite and console-email settings. Playwright observed zero browser console errors. `/login`, `/signup`, `/verify-email`, and `/contact` rendered; a sanitized local login attempt displayed the missing Firebase client-configuration message; signed-out `/archive` redirected to `/login`. No signup, action-code, reset, ticket, inbox, or provider action was submitted. The browser, servers, snapshots, and raw logs were removed after evidence was summarized.

## Credential-Free Expected Blockers

These preflights intentionally verified fail-closed behavior only. They are not live provider evidence.

| Logical command | Safe configuration | Result | Duration |
| --- | --- | --- | ---: |
| `npm.cmd run check:email -w server` | `EMAIL_MODE=smtp` with `SMTP_PASS` absent | EXPECTED BLOCKED (exit 1): missing `SMTP_PASS`; no SMTP connection attempted | 3.391s |
| `npm.cmd run check:storage -w server` | `FIREBASE_STORAGE_BUCKET` absent | EXPECTED BLOCKED (exit 1): missing bucket before Firebase initialization | 3.957s |

## Live External Evidence

| Use case | Status | Missing evidence/blocker |
| --- | --- | --- |
| UC1 signup and email verification | BLOCKED / NOT RUN | Requires Firebase client/admin configuration, a controlled inbox, live SMTP, and successful `applyActionCode`; no action code was fabricated. |
| UC2 verified login and protected access | BLOCKED / NOT RUN | Requires the deployed origin in Firebase authorized domains and a real verified account. |
| UC3 password reset and login with the new password | BLOCKED / NOT RUN | Requires live OTP inbox delivery and a controlled Firebase account. |
| UC8 Contact Us persistence plus submitter/admin email | BLOCKED / NOT RUN | Requires live SMTP, controlled recipient/admin inboxes, and configured production persistence. |
| Firebase Storage | BLOCKED / NOT RUN | Requires a configured bucket and backend credentials; Admin SDK bucket access and client rules were not tested. |

No production source, package manifest, or lockfile changed during verification. No secrets, screenshots, raw command logs, email addresses, or temporary shim files are retained in this evidence.
