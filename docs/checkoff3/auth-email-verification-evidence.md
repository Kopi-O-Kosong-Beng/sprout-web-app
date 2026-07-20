# Checkoff 3 Auth and Email Verification Evidence

**Recorded:** 2026-07-21 (Asia/Singapore)
**Commit under test:** `cd7e8366d2001f49909cf166347d593c8c0e148a`
**Runtime used for checks:** disposable Node `v22.23.1` from `npx -y -p node@22`; npm CLI invoked with that executable. The active shell was Node `v24.14.0`, which does not satisfy the repository's `22.x` engine.
**Configuration:** no Firebase web credentials, Firebase Admin credentials, Gmail App Password, authorized deployed domain, or Firebase Storage bucket were configured.

## Automated Checks

| Command | Result | Evidence |
| --- | --- | --- |
| `npm.cmd run typecheck -w server` | PASS (exit 0) | TypeScript completed with `--noEmit`. |
| `npm.cmd test -w server` | PASS (exit 0) | Jest: 7 suites, 63 tests, 0 snapshots. Includes Firebase-admin fakes and auth/email behavior tests. |
| `npm.cmd test -w client` | PASS (exit 0) | Vitest: 5 files, 17 tests. Includes `ProtectedRoute` signed-out/unverified/verified route-guard coverage. |
| `npm.cmd run lint -w client` | PASS (exit 0, 3 warnings) | Existing Fast Refresh `only-export-components` warnings: two in `AuthContext.tsx`, one in `PlantVisuals.tsx`. |
| `npm.cmd run build -w client` | PASS (exit 0) | `tsc -b && vite build`; Vite built 109 modules. |
| `npm.cmd test` | PASS (exit 0) | Root regression: server 7 suites/63 tests and client 5 files/17 tests. |

No production files, manifests, or lockfiles changed while obtaining the Node 22 runtime or running the checks.

## Local Browser Smoke Checks

Backend and client ran locally under Node 22 on loopback-only free ports (`3011` and `5179`) with SQLite and console-email settings, then were shut down. Playwright observed zero browser console errors.

| Surface | Result | Scope |
| --- | --- | --- |
| `/login` | PASS (local render) | Form rendered. A sanitized local-only attempt showed the expected missing Firebase client-config message; no browser errors. |
| `/signup` | PASS (local render) | Signup form rendered; no account creation attempted. |
| `/verify-email` | PASS (local render) | No-code verification page rendered; no Firebase action code was used. |
| `/contact` | PASS (local render) | Contact form rendered; no ticket submission or email send attempted. |
| `/archive` while signed out | PASS (local guard) | Redirected to `/login`. Automated route-guard fakes cover unverified and authenticated branches. |

## External Evidence Boundaries

| Check | Status | Reason |
| --- | --- | --- |
| `npm.cmd run check:email -w server` default configuration | NOT LIVE | Console mode returned `mode=console verified=true`; this is not SMTP evidence. |
| SMTP preflight with `EMAIL_MODE=smtp` and no `SMTP_PASS` | BLOCKED as expected | Exit 1: missing `SMTP_PASS`; no SMTP connection was attempted. |
| Firebase Storage preflight | BLOCKED as expected | `npm.cmd run check:storage -w server` exited 1 before Firebase initialization: missing `FIREBASE_STORAGE_BUCKET`. |
| Signup, inbox delivery, verification action-code completion, reset, Contact Us persistence/admin email | NOT RUN | Requires controlled inboxes plus Firebase/Gmail configuration; no credentials or codes were fabricated. |
| Firebase authorized deployed domain | NOT RUN | No deployed origin was configured or tested. |

This record establishes automated and credential-free local evidence only. It does not pass live SMTP, inbox, Firebase authorized-domain/action-link, or Storage behavior.
