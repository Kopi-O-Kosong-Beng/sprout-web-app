# Task 4 Report: Sprout Verification Page and Verified Route Gate

Date: 2026-07-20
Worktree: `D:\SUTD\Term5\ESC\Sprout_WebApp\sprout-app\.worktrees\checkoff3-auth-email`
Branch: `codex/checkoff3-auth-email`

## Status

Implemented the frontend test framework, in-app Firebase email verification page, authenticated resend flow, login/signup verification handoff, and verified-only route gate. The root test script now runs both server and client workspaces. All final tests, typechecks, and builds pass.

## Dependency And Lockfile Changes

Installed from the repository root with the exact requested ranges:

```powershell
npm.cmd install -D -w client vitest@^4.1.10 jsdom@^29.1.1 @testing-library/react@^16.3.2 @testing-library/dom@^10.4.1 @testing-library/jest-dom@^6.9.1 @testing-library/user-event@^14.6.1 @vitest/coverage-v8@^4.1.10
```

Result: 95 packages added, 1,107 packages audited, 0 vulnerabilities. `client/package.json` now carries the requested test dependencies and a `vitest run` script. `client/package-lock.json` was deleted. The root `package-lock.json` is authoritative for both workspaces and now records the client test graph, including Vitest 4.1.10 and jsdom 29.1.1.

The root scripts are now:

```json
"test": "npm run test:server && npm run test:client",
"test:server": "npm test -w server",
"test:client": "npm test -w client"
```

## TDD Evidence

### Smoke GREEN

Command:

```powershell
npm.cmd test -w client
```

Initial result after framework setup: 1 test file passed, 1 test passed. The jsdom smoke test confirmed `HTMLElement` and DOM creation are available.

### Feature RED

Command:

```powershell
npm.cmd test -w client -- --run src/pages/VerifyEmailPage.test.tsx src/components/common/ProtectedRoute.test.tsx
```

First result: RED. Vitest reported the missing `VerifyEmailPage` module and showed that `ProtectedRoute` rendered `Private archive` for an unverified account. This run also exposed cross-test DOM retention because Vitest globals are disabled. Central `afterEach(cleanup)` was added to the test setup, then RED was rerun.

Clean RED result: 2 test files failed. The verification suite failed only because `VerifyEmailPage` did not exist; the route suite had 1 expected failure because unverified users still reached protected content, while loading, signed-out, and authenticated behavior passed.

Command:

```powershell
npm.cmd test -w client -- --run src/pages/LoginPage.test.tsx src/pages/SignupPage.test.tsx
```

Result: RED with 3 expected failures and 1 pass. An unverified login navigated to `/archive`, display name still allowed 80 characters, and signup success still exposed `EMAIL_MODE=console` instructions. The authenticated login redirect already passed.

### Feature GREEN

Command:

```powershell
npm.cmd test -w client -- --run src/pages/VerifyEmailPage.test.tsx src/components/common/ProtectedRoute.test.tsx src/pages/LoginPage.test.tsx src/pages/SignupPage.test.tsx
```

Result: 4 test files passed, 13 tests passed, no console warnings or errors.

## Route And State Behavior

- `/verify-email?mode=verifyEmail&oobCode=...` reads parameters through React Router's `useSearchParams`, calls Firebase `applyActionCode`, refreshes the current Firebase user and token through `refreshProfile`, and shows verified or invalid/expired copy.
- A per-code ref prevents duplicate action-code application when React development effects are replayed. The async flow handles both synchronous Firebase configuration failures and promise rejections.
- Authenticated unverified users can resend through strict `POST /api/auth/resend-verification`. The UI represents idle, applying, verified, invalid, sending, sent, and retryable failure states. The resend button is disabled while sending and is hidden from signed-out users.
- Signed-out verification visitors are directed to login. Authenticated verified users are directed to the archive.
- `ProtectedRoute` renders nothing while loading, redirects signed-out users to login, redirects unverified users to `/verify-email`, and renders children only for authenticated verified users.
- `LoginPage` sends unverified sessions to `/verify-email`. Only authenticated sessions return to the original protected destination. Form submission now waits for `AuthContext` status rather than navigating before verification state is known.
- `SignupPage` consumes `verificationEmailSent`, distinguishes successful delivery from delivery failure, removes visible local-console instructions, limits display names to 50 characters, and directs users to login for verification continuation or resend.
- `AuthContext` required no Task 4 edit because Task 3 already supplied the four-state model and stable `refreshProfile` callback that reloads Firebase user state, force-refreshes the token, and derives the new status.

## Files

Created:

- `client/src/pages/VerifyEmailPage.tsx`
- `client/src/pages/VerifyEmailPage.test.tsx`
- `client/src/components/common/ProtectedRoute.test.tsx`
- `client/src/pages/LoginPage.test.tsx`
- `client/src/pages/SignupPage.test.tsx`
- `client/src/test/setup.ts`
- `client/src/test/setup.test.ts`
- `.superpowers/sdd/task-4-report.md`

Modified:

- `package.json`
- `package-lock.json`
- `client/package.json`
- `client/vite.config.ts`
- `client/src/App.tsx`
- `client/src/components/common/ProtectedRoute.tsx`
- `client/src/pages/LoginPage.tsx`
- `client/src/pages/SignupPage.tsx`
- `client/src/services/sproutApi.ts`

Deleted:

- `client/package-lock.json`

## Commands And Results

```text
node --version
v24.14.0

npm.cmd --version
11.9.0

npm.cmd test -w client
PASS - 5 files, 14 tests

npm.cmd run lint -w client
PASS (exit 0) - 0 errors; 3 existing react(only-export-components) warnings in AuthContext.tsx and PlantVisuals.tsx

npm.cmd run build -w client
PASS - TypeScript project build and Vite production build; 109 modules transformed

npm.cmd test
PASS - server: 5 suites, 49 tests; client: 5 files, 14 tests

npm.cmd run typecheck -w server
PASS - tsc --noEmit

npm.cmd run build -w server
PASS - tsc

git diff --check
PASS - no whitespace errors; Git emitted Windows LF-to-CRLF working-copy notices
```

The first client build correctly failed with `TS2345` because TypeScript did not retain the non-null `oobCode` narrowing inside a nested async function. The narrowed value is now captured as `actionCode`; the focused verification suite and production build both passed immediately after that single fix.

## Self-Review

- Confirmed tests mock Firebase, API, and auth seams without production test branches or application-only providers.
- Confirmed no query-string splitting, local verification token logic, or non-POST resend path was introduced.
- Confirmed `refreshProfile` remains a stable callback, effect dependencies are scalar/stable, and action-code execution is guarded against development effect replay.
- Confirmed async action-code and resend failures are caught and produce visible retry guidance, with no unhandled test console output.
- Confirmed the verification page reuses existing compact auth layout, CTA, footer, and plant visual patterns; no unrelated UI or CSS was redesigned.
- Confirmed the stale route-gate comment was updated during review.
- Confirmed lockfile ownership is singular at the repository root and `npm install` reports zero vulnerabilities.
- Reviewed the full diff for unrelated changes; none were found.

## Concerns

- The environment runs Node 24.14.0 while root and server `engines` declare Node 22.x. npm emits `EBADENGINE` warnings during install. Per task direction, engines were not rewritten; all checks passed under Node 24, but CI/deployment should continue to use declared Node 22.
- Client lint exits successfully but reports three pre-existing Fast Refresh warnings in `AuthContext.tsx` and `PlantVisuals.tsx`. This task did not refactor those unrelated module boundaries.
- Git reports LF-to-CRLF working-copy notices on Windows. `git diff --check` reports no whitespace errors.
