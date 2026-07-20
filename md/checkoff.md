# Sprout — Checkoff Walkthrough

This document explains, end to end, how the four demo flows work: **Signup**, **Login**, **Query ticket**, and **frontend rendering** (Home, Archive, PVE Battle, Query). Every step names the exact function and `file:line` so you can open the code and follow along. Line numbers are accurate as of 2026-07-12 — if the file has been edited since, search for the function name instead.

**The one-paragraph mental model:** the frontend is a React app (Vite dev server, `http://localhost:5173`) that renders pages and calls the backend over HTTP using axios. The backend is an Express app (`http://localhost:3001`) that validates requests with Joi, does the work in a *service* function, stores data through a *repository* (SQLite locally, Firestore in production), and sends emails through one shared email service (console-logged in dev, real Gmail SMTP when configured). Login is the one flow with **no backend endpoint** — the browser talks directly to Firebase Auth, and the backend only ever *verifies* the resulting token.

---

## 0. Running the stack

```bash
npm run dev:server   # Express on http://localhost:3001  (health check: GET /api/health)
npm run dev:client   # Vite/React on http://localhost:5173 (must be 5173 — CORS is locked to it)
```

Demo login: `demo@sprout.app` / `Password123!`.

Two env facts that explain most "why doesn't it work" moments:

- [server/app.ts:18-28](server/app.ts#L18-L28) — CORS only allows `http://localhost:5173`. If Vite silently starts on 5174 (port busy), every API call fails in the browser only.
- `EMAIL_MODE` in `server/.env` — `console` prints every email to the backend terminal (dev/test default); `smtp` sends real mail via Gmail using the `SMTP_*` vars ([.env.example:23-34](.env.example#L23-L34)).

---

## 1. Frontend rendering — how a page gets on screen

### 1.1 Boot chain

1. Browser loads `client/index.html`, which loads [client/src/main.tsx](client/src/main.tsx). `createRoot(...).render(<App/>)` (main.tsx:6-10) mounts React into the `<div id="root">`.
2. [App.tsx:14-48](client/src/App.tsx#L14-L48) is the whole app skeleton:
   ```
   <BrowserRouter>          ← enables URL-based routing
     <AuthProvider>         ← global login state (see §3)
       <AppHeader />        ← the top nav bar, on every page
       <Routes> ... </Routes>  ← swaps the page component by URL
   ```
3. The route table (App.tsx:20-43) maps URLs to page components: `/` → `LandingPage`, `/login` → `LoginPage`, `/signup` → `SignupPage`, `/contact` → `ContactPage`, `/archive` → `ArchivePage`, `/battle` → `BattlePage`, plus `/test` (developer API test page). Anything else redirects to `/`.

### 1.2 Protected routes

`/archive` and `/battle` are wrapped in `<ProtectedRoute>` (App.tsx:25-40). [ProtectedRoute.tsx:8-19](client/src/components/common/ProtectedRoute.tsx#L8-L19) reads the global auth status and makes a three-way choice: still `loading` → render nothing (avoids a redirect flash); `signed-out` → `<Navigate to="/login">`, remembering where you came from in `state.from`; otherwise → render the page.

### 1.3 The nav bar

[AppHeader.tsx](client/src/components/common/AppHeader.tsx) renders on every page. `navItems` (lines 5-11) marks Archive and PVE Battle `requiresAuth: true`; for visitors those render as greyed-out disabled `<span>`s instead of links (lines 33-42). The right side switches between Log in/Sign up links and "identity + Log out" using `signedIn` (line 17). The Log out button calls `handleLogout` (lines 20-23) → `logout()` from AuthContext → Firebase `signOut` → the whole app reacts automatically (§3.4).

### 1.4 The four demo pages

| Page | File | What it renders |
|---|---|---|
| Home `/` | [LandingPage.tsx:15-41](client/src/pages/LandingPage.tsx#L15-L41) | Static hero: the CSS-drawn cactus (`CactusHero`), headline, and two `FeatureCard`s. **Zero API calls.** |
| Archive `/archive` | [ArchivePage.tsx](client/src/pages/ArchivePage.tsx) | A grid of avatar card `<button>`s; clicking one calls `setSelectedAvatarId` (line 41) — plain React state, and the detail panel re-renders with that avatar's stats. Currently a static preview fed by the `plantAvatars` array in [PlantVisuals.tsx:19-80](client/src/components/common/PlantVisuals.tsx#L19-L80); the real `GET /api/avatar` wiring is a later slice. |
| PVE Battle `/battle` | [BattlePage.tsx](client/src/pages/BattlePage.tsx) | A tiny state machine: `view` is `'select' \| 'loading' \| 'battle'` (line 21). "Start PVE Match" calls `startBattleLoading` (lines 29-32) which flips to `loading`, waits 900ms, then shows the battle arena. Static preview — the real `POST /api/battle/pve/*` endpoints are Phase 2. |
| Query `/contact` | [ContactPage.tsx](client/src/pages/ContactPage.tsx) | A real, fully-wired form — see §5. |

The plant sprites everywhere are not images: `PlantAvatar` ([PlantVisuals.tsx:82-100](client/src/components/common/PlantVisuals.tsx#L82-L100)) renders nested `<span>`s that `App.css` styles into a body, two leaves, eyes, and a pot with gradients.

---

## 2. Signup (UC1)

**Path of a click:** Create Account button → React handler → axios POST → Express route → Joi validation → auth service → Firebase + database + email → 201 back to the browser.

### 2.1 Frontend

- The form lives in [SignupPage.tsx](client/src/pages/SignupPage.tsx). Typing in each field updates React state via `onChange` handlers (e.g. `setEmail`, line 109); the live password checklist is computed by `getPasswordCriteria` in [validation.ts:11-19](client/src/utils/validation.ts#L11-L19) — the client-side mirror of the backend's password rule.
- Pressing **Create Account** submits the form → `handleSubmit` ([SignupPage.tsx:21](client/src/pages/SignupPage.tsx#L21)). It first runs local checks (empty fields, weak password, mismatched confirm — each sets a visible error message and stops), then calls `signupUser(...)`.
- `signupUser` ([sproutApi.ts:117-120](client/src/services/sproutApi.ts#L117-L120)) is one line of axios: `POST /api/auth/signup` with `{email, password, displayName}`.
- On success, the page swaps to the "check your inbox" interstitial (SignupPage.tsx:56+). On failure, `extractApiError` ([apiClient.ts:55-69](client/src/services/apiClient.ts#L55-L69)) turns the response into a human message — it prefers the backend's exact `{error: "..."}` string, falling back to per-status messages (apiClient.ts:40-48). A 409 additionally shows a "Log in instead" link.

### 2.2 Backend

1. **Route** — [auth.routes.ts:40](server/routes/auth.routes.ts#L40): `router.post('/signup', authLimiter, validate(signupSchema), handleSignup)`. Three things run in order:
   - `authLimiter` (lines 17-22): max 10 signups per 15 min per IP → `429`.
   - `validate(signupSchema)` ([validation.middleware.ts:5-18](server/middleware/validation.middleware.ts#L5-L18)): Joi checks email format and displayName 1-80 chars → `400` with the reason.
   - `handleSignup` ([auth.controller.ts:11-18](server/controllers/auth.controller.ts#L11-L18)): a thin wrapper — calls the service, sends `201` + JSON, forwards any error to the central error handler.
2. **Service** — `signup()` ([auth.service.ts:99](server/services/auth.service.ts#L99)) does the actual work, in order:
   - `assertStrongPassword` (auth.service.ts:49-62): ≥8 chars, upper, lower, digit, symbol → else `400`.
   - duplicate email / display name check against the database → `409` with exact strings like `"An account with this email already exists."` (auth.service.ts:107, 112).
   - `authAdmin.createUser(...)` — creates the user in **Firebase Auth** (the thing you actually log in against later).
   - creates the local profile row + password history via the repository.
   - `generateEmailVerificationLink(email)` (auth.service.ts:133) then `sendEmail(...)` (auth.service.ts:134-138) — the verification email. If email delivery fails here, signup returns `500` (deliberately loud — tested in `tests/auth.test.ts`).
3. **Email** — `send()` in [email.service.ts:45-64](server/services/email.service.ts#L45-L64): `EMAIL_MODE=console` → prints to terminal; `EMAIL_MODE=smtp` → `getSmtpTransporter()` (lines 28-43) builds one cached Nodemailer Gmail transport from `SMTP_HOST/PORT/USER/PASS` and sends for real. Any missing var throws `"Missing required email env var: SMTP_HOST (required when EMAIL_MODE=smtp)"`.
4. **Error path** — every `next(err)` funnels into [error.middleware.ts:8-15](server/middleware/error.middleware.ts#L8-L15): known errors keep their status + message; anything unknown becomes `500 {error: "Internal server error."}`.

---

## 3. Login (UC2) — the flow with no backend endpoint

Login is 100% client-side against Firebase Auth. The backend never sees your password; it only verifies the *ID token* Firebase gives you.

### 3.1 The click

- **Log In** button → `handleLogin` ([LoginPage.tsx:43](client/src/pages/LoginPage.tsx#L43)) → `login(email, password)` from the auth context (LoginPage.tsx:48).
- `login()` ([AuthContext.tsx:110-122](client/src/context/AuthContext.tsx#L110-L122)) calls the Firebase SDK directly: `signInWithEmailAndPassword(getSproutFirebaseAuth(), email, password)`. `getSproutFirebaseAuth` ([firebaseClient.ts:15-21](client/src/services/firebaseClient.ts#L15-L21)) initializes Firebase from the `VITE_FIREBASE_*` vars in `client/.env.local`.
- Wrong password? `mapFirebaseLoginError` ([AuthContext.tsx:49-65](client/src/context/AuthContext.tsx#L49-L65)) collapses every credential-shaped Firebase error into one string — `"Invalid email or password."` — so an attacker can't tell which field was wrong (anti-enumeration).

### 3.2 How the whole app finds out

`AuthProvider` subscribed to Firebase's `onAuthStateChanged` at startup (AuthContext.tsx:102-108). The successful sign-in fires that callback → `deriveState` (AuthContext.tsx:74-100) computes one of four statuses: `loading` / `signed-out` / `unverified` (signed in but email not verified) / `authenticated`. For verified users it also fetches the backend profile via `getCurrentUser()` → `GET /api/auth/me` ([sproutApi.ts:122-129](client/src/services/sproutApi.ts#L122-L129)). Every component using `useAuth()` ([useAuth.ts:4-10](client/src/hooks/useAuth.ts#L4-L10)) re-renders: the header shows your name, disabled nav links become real links, `ProtectedRoute` starts letting you through.

### 3.3 How API calls authenticate afterwards

The axios **request interceptor** ([apiClient.ts:17-23](client/src/services/apiClient.ts#L17-L23)) runs before every request: it asks the Firebase SDK for a fresh ID token (`currentUser.getIdToken()` — the SDK caches/refreshes it) and adds `Authorization: Bearer <token>`. Nothing is ever stored in localStorage.

Server side, [auth.middleware.ts](server/middleware/auth.middleware.ts) verifies that header on protected routes: no/invalid token → `401 Unauthorised.` (line 59), valid token but unverified email → `403 Email is not verified.` (line 72). The **response interceptor** (apiClient.ts:28-37) reacts to `401` only — it signs you out (token truly dead), while `403` keeps you signed in and shows the verify notice. Extra detail: `/login` also visits the backend once — `recordSessionLogin()` → `POST /api/auth/session/login` ([auth.routes.ts:42](server/routes/auth.routes.ts#L42)) — purely to timestamp `lastLogin` on the profile; it is best-effort and not required for auth.

### 3.4 Logout + the "can't see login while logged in" rule

`logout()` (AuthContext.tsx:124-128) records `lastLogout` then calls Firebase `signOut` → `onAuthStateChanged` fires with `null` → status becomes `signed-out` everywhere. And [LoginPage.tsx:33-36](client/src/pages/LoginPage.tsx#L33-L36) redirects any already-signed-in visitor away from `/login`, so the only way back to the form is logging out first.

### 3.5 Reset Password (UC3, lives on the same page)

LoginPage has a `mode` switch (`'login' | 'reset-request' | 'reset-verify'`, line 9). "Send Reset OTP" → `requestPasswordReset(email)` → `POST /api/auth/request-reset` — the backend **always answers 200** with the same message whether the email exists or not (anti-enumeration, [auth.service.ts:199](server/services/auth.service.ts#L199)); for real accounts it generates a 6-digit OTP (`randomInt`, line 206), bcrypt-hashes it, stores it with a 15-minute expiry (line 210), and emails the plaintext code via the same `sendEmail` seam. "Verify OTP + Reset" → `verifyPasswordReset({email, otp, newPassword})` → `POST /api/auth/verify-reset` → `verifyPasswordReset()` ([auth.service.ts:239](server/services/auth.service.ts#L239)) checks OTP validity/expiry, password strength, and password-reuse history before updating Firebase + the local hash.

---

## 4. Query ticket (UC8)

The only flow that needs **no login at all**.

### 4.1 Frontend

- Form in [ContactPage.tsx:80-130](client/src/pages/ContactPage.tsx#L80-L130): name, email, a category `<select>` built from `TICKET_CATEGORIES` ([sproutApi.ts:36-42](client/src/services/sproutApi.ts#L36-L42) — `general|bug|billing|partnership|other`), and a message box with a live `{length}/2000` counter (line 116) that hard-stops at 2000 chars (line 120).
- **Submit Ticket** → `handleSubmit` (ContactPage.tsx:22-44) → `submitTicket(...)` ([sproutApi.ts:112-115](client/src/services/sproutApi.ts#L112-L115)) → `POST /api/query/submit`.
- Success clears the form and shows the reference number + "Submit Another Ticket" (lines 58-78). Failure keeps everything you typed (state is only cleared in the success branch — line 34's comment) and shows the backend's error message.

### 4.2 Backend

1. **Route** — [query.routes.ts:21](server/routes/query.routes.ts#L21): `router.post('/submit', validate(querySchema), handleQuerySubmit)`. The Joi schema (lines 10-17) enforces name 1-100, valid email, category in the enum, message 1-2000 → else `400`.
2. **Controller** — `handleQuerySubmit` ([query.controller.ts:5-12](server/controllers/query.controller.ts#L5-L12)): calls the service, replies `201 {refNumber}`.
3. **Service** — `createTicket` ([ticket.service.ts:10-34](server/services/ticket.service.ts#L10-L34)):
   - `ticketRepository.create(input)` persists the ticket and mints the reference number `SPR-YYYYMMDD-NNNN` (zero-padded **daily** counter, atomic per repo implementation). The repository selector ([repositories/tickets.ts](server/repositories/tickets.ts)) picks SQLite or Firestore from `DATASTORE` — the service code is identical for both.
   - It then independently attempts both UC8 emails with `Promise.allSettled`: confirmation to the submitter and notification to `ADMIN_EMAIL` (the Sprout team inbox, `hello.sprout.team@gmail.com`). Each outcome is persisted as `submitterEmailStatus` / `adminEmailStatus` (`sent` or `failed`) with `lastEmailError` and `notificationUpdatedAt`. Either delivery may fail without skipping the other attempt or losing the already-persisted ticket; the request still succeeds under alt-flow 5a.

---

## 5. The shared plumbing (read once, applies everywhere)

- **[apiClient.ts](client/src/services/apiClient.ts)** — one axios instance with `baseURL` from `VITE_API_URL` (default `http://localhost:3001`). Request interceptor = attach token (§3.3). Response interceptor = sign out on 401. `extractApiError` = backend `{error}` string → fallback per-status message → never axios's raw "Request failed with status code 400".
- **[server/app.ts](server/app.ts)** — the middleware order matters: env load (line 3) → CORS (18) → JSON body parsing (31) → global rate limit (35) → `/api/health` (45) → the three routers (50-52) → 404 (55) → the **central error handler last** (58). Every controller `next(err)`s into it; that's why controllers stay 8 lines long.
- **[email.service.ts](server/services/email.service.ts)** — the single seam all three email-sending flows share (signup link, reset OTP, ticket emails). Console mode is why Jest and dev demos never need SMTP credentials.

## 6. How we know it works — backend test suite

`npm test -w server` → **3 suites, 31 tests** (Jest + Supertest on a throwaway SQLite file, Firebase admin mocked — no network, no credentials):

- [tests/auth.test.ts](server/tests/auth.test.ts) — signup 201 + hashing + verification-link email logged; duplicate email/display name 409 with exact strings; weak password/malformed email 400; **500 when SMTP is misconfigured during signup**; full OTP reset round-trip including expiry, wrong OTP, password reuse, and anti-enumeration (known and unknown emails return identical bodies).
- [tests/query.test.ts](server/tests/query.test.ts) — ticket 201 + `SPR-\d{8}-\d{4}` + row persisted; daily sequence never duplicates; each Joi rule's 400; **alt-flow 5a: email delivery failure still returns 201 and persists the ticket**.
- [tests/email.test.ts](server/tests/email.test.ts) — unit tests of the email seam with Nodemailer mocked: console mode logs and never touches SMTP; smtp mode builds the correct Gmail transport (587/STARTTLS vs 465/TLS), sends the exact payload, falls back `EMAIL_FROM → SMTP_USER`, reuses one cached transporter; each missing `SMTP_*` var fails with a clear named error; unknown `EMAIL_MODE` rejects.

Frontend rendering is verified manually for now (the checkoff demo itself): all four pages render with no console errors, disabled nav for visitors, and the three flows above complete against the live backend.

---

## 7. Differences between the supplied diagrams and the current implementation

Audit date: **2026-07-16**. The diagrams describe the intended end-state architecture; this section records what the repository implements today. “Partial” means that a page, schema, or read API exists, but the complete sequence shown in the diagram does not.

### 7.1 Sequence-diagram differences

| Diagram / use case | Status | Difference in the current implementation |
|---|---|---|
| **Login** | Implemented differently | There is no backend `submitLogin(email, password)` endpoint, `Account.validateCredentials()`, or application-created session token. The React client signs in directly with Firebase using `signInWithEmailAndPassword`; the Firebase ID token is then attached to API requests. `POST /api/auth/session/login` only records login audit data, and `GET /api/auth/me` fetches the profile ([AuthContext.tsx:117](../client/src/context/AuthContext.tsx#L117), [sproutApi.ts:122](../client/src/services/sproutApi.ts#L122), [auth.routes.ts:41](../server/routes/auth.routes.ts#L41)). Login does not fetch avatars and game stats as one “synced data” response. Wrong-password, missing-account, invalid-email, and similar Firebase failures are deliberately collapsed into the same `Invalid email or password.` message instead of the diagram's separate branches ([AuthContext.tsx:42](../client/src/context/AuthContext.tsx#L42)). |
| **Signup** | Implemented differently | The implementation accepts `displayName`, email, and password; it has no separate username field or “invalid username” branch ([auth.routes.ts:24](../server/routes/auth.routes.ts#L24)). It validates format/duplicates locally, creates the Firebase user and local profile **before** generating and emailing a Firebase verification link ([auth.service.ts:99](../server/services/auth.service.ts#L99)). The diagram instead places email verification/ownership confirmation before account creation. After signup, the UI shows “check your inbox” and requires a later login; it does not redirect immediately as an authenticated user ([SignupPage.tsx:64](../client/src/pages/SignupPage.tsx#L64)). If verification-email delivery fails, the already-created Firebase/profile records are not rolled back. |
| **Password reset** | Implemented differently | The flow uses two endpoints: `POST /api/auth/request-reset` and `POST /api/auth/verify-reset`; the second request submits the OTP and new password together ([auth.routes.ts:44](../server/routes/auth.routes.ts#L44), [LoginPage.tsx:74](../client/src/pages/LoginPage.tsx#L74)). OTP hash/expiry are stored on the user profile rather than in a standalone `OTP` entity. Unknown email addresses return the same HTTP 200 body as known addresses (anti-enumeration), unlike the diagram's explicit “No account found” result ([auth.service.ts:199](../server/services/auth.service.ts#L199)). There is no per-account OTP attempt counter or account-lock branch; only the shared IP rate limiter applies. “Request a new code” repeats the request endpoint and overwrites the stored OTP rather than calling a separate resend operation. Password strength, expiry, last-three password history, Firebase password update, and OTP invalidation are implemented ([auth.service.ts:239](../server/services/auth.service.ts#L239)). |
| **Contact/query ticket** | Implemented with contract differences | The route is `POST /api/query/submit`, not `POST /api/query` ([query.routes.ts:19](../server/routes/query.routes.ts#L19)). The form sends `name`, `email`, `category`, and `message`; it does not collect the diagram's optional organisation or subject fields, and `category` replaces `inquiryType` ([ContactPage.tsx:11](../client/src/pages/ContactPage.tsx#L11), [ticket.ts:13](../server/models/ticket.ts#L13)). The ticket is persisted before email delivery and receives an `SPR-YYYYMMDD-NNNN` reference. Submitter and admin notifications are attempted independently with `Promise.allSettled`; their `sent` / `failed` outcomes, update time, and any bounded error detail are persisted. There is no automated retry job/queue, but either delivery may fail without skipping the other attempt or losing the ticket ([ticket.service.ts:11](../server/services/ticket.service.ts#L11)). |
| **Avatar archive** | Partial | Protected backend reads exist as paginated `GET /api/avatar` and `GET /api/avatar/:avatarId`, using the authenticated Firebase UID rather than a client-supplied `accountId` ([avatar.routes.ts:11](../server/routes/avatar.routes.ts#L11), [avatar.controller.ts:7](../server/controllers/avatar.controller.ts#L7)). However, `ArchivePage` does not call them: it renders the hard-coded `plantAvatars` array and selects details in local React state ([ArchivePage.tsx:1](../client/src/pages/ArchivePage.tsx#L1)). The diagram's database-unreachable cached-data warning and no-avatar empty state are not implemented in this page. |
| **Plant upload / identification / generated avatar** | Not implemented | No upload page route, `/api/plant/upload`, `/api/plant/save`, `PlantController`, Plant/Gemma/Flux adapter, confidence branch, temporary session cache, or write API is mounted. The Express app currently mounts only auth, query, and avatar-read routers ([server/app.ts:49](../server/app.ts#L49)). The avatar table/repository can represent stored records, but the repository interface only lists and reads owned avatars ([avatar.ts:34](../server/models/avatar.ts#L34)). |
| **PVE battle** | Schema/UI preview only | A `battle_sessions` SQLite migration exists, but there is no battle router, controller, service, repository, game engine, turn endpoint, summary endpoint, retry path, or save-avatar endpoint ([20260708100004_create_battle_sessions.ts:5](../server/database/migrations/20260708100004_create_battle_sessions.ts#L5)). `BattlePage` is explicitly a static preview: a 900 ms timer changes views, HP/log values are fixed, and the Attack/Special/Defend buttons have no handlers ([BattlePage.tsx:1](../client/src/pages/BattlePage.tsx#L1), [BattlePage.tsx:29](../client/src/pages/BattlePage.tsx#L29)). |
| **PVP matchmaking and battle** | Not implemented | There is no PVP route/page mode, matchmaking queue, `PvpController`, multiplayer server, opponent synchronization, turn timer, result write/retry, or PVP summary flow. The single `/battle` route renders only the static PVE preview ([App.tsx:33](../client/src/App.tsx#L33)). |
| **WebSocket disconnect/reconnect flows** | Not implemented | The server has no WebSocket transport or heartbeat/reconnection implementation, so the diagram's five reconnect attempts, 30-second mid-battle grace period, default win, draw/incomplete-state persistence, penalties, and return-to-queue behavior do not occur. No WebSocket or Socket.IO server dependency is declared in [server/package.json](../server/package.json). |

### 7.2 Class-diagram differences

| Diagram class/relationship | Current implementation |
|---|---|
| **Account** | Implemented as `AuthUserProfile` / `users`, keyed by the Firebase UID. In addition to email and password hash, it stores `displayName`, verification state, reset-OTP hash/expiry, login/logout audit values, and timestamps ([auth.ts:1](../server/models/auth.ts#L1)). |
| **GameStats** | No `GameStats` model, table, collection repository, or account-to-stats implementation exists. Consequently login and battle flows cannot load/update skill rating, wins, losses, or draws as shown. |
| **PasswordHistory** | Implemented as a separate `password_history` table/collection with `id`, `userId`, `passwordHash`, and `changedAt`, rather than only `oldPasswordHash` and `archivedDate` ([20260708100002_create_password_history.ts:5](../server/database/migrations/20260708100002_create_password_history.ts#L5)). |
| **OTP** | Not a standalone entity. `resetOtpHash` and `resetOtpExpiresAt` are embedded in the user profile; the plaintext OTP is never persisted ([auth.ts:1](../server/models/auth.ts#L1)). |
| **PlantAvatar / PlantSpecies** | `avatar_records` flattens the design into one record: `speciesName`, optional `speciesFamily`, sprite URL, discovery/source/temporary fields, battle-stat JSON, and free-form metadata. There is no separate `PlantSpecies` entity/table or typed habitat/conservation-status relationship ([avatar.ts:10](../server/models/avatar.ts#L10), [20260708100003_create_avatar_records.ts:6](../server/database/migrations/20260708100003_create_avatar_records.ts#L6)). |
| **Battle, PVEBattle, PVPBattle, NPC, BattleAction, BattleResult** | The class hierarchy and related entities are not implemented. The only persistence artifact is a PVE-oriented `battle_sessions` table containing a user/avatar reference, an embedded `npcAvatar` JSON snapshot, current HP, turn, status, log, and timestamps. There is no PVP subclass, NPC table, per-turn action table, association-class battle result, or per-player stats delta. |
| **QueryTicket** | Correctly remains standalone (no account/login association), but its implemented fields are `id`, `refNumber`, `name`, `email`, `category`, `message`, `status`, `createdAt`, and `updatedAt`; the diagram's `subject`, `body`, and `inquiryType` names are not used ([ticket.ts:13](../server/models/ticket.ts#L13), [20260708100005_create_query_tickets.ts:5](../server/database/migrations/20260708100005_create_query_tickets.ts#L5)). |
| **Cross-Platform DB** | Production persistence is represented by Firestore repositories, while SQLite repositories/migrations remain the local and test fallback. Services depend on repository interfaces rather than a literal `DB` class. |

### 7.3 Checkoff boundary

For the current checkoff, the fully demonstrable end-to-end behavior is **signup, Firebase login/profile audit, OTP password reset, and query-ticket submission**. Archive has working protected read APIs but a static page; plant upload, real PVE, PVP, and WebSocket recovery should be presented as planned diagram behavior, not as completed implementation.
