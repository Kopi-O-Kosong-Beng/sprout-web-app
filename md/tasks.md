# Implementation Tasks

> **Historical pre-cutover backlog:** database tasks and SQLite/Knex instructions in this file were superseded by the Firestore-only runtime on 2026-07-22. They remain only as project-history evidence; current implementation work follows `docs/superpowers/plans/2026-07-22-firestore-archive-pve.md`.

> **How to work this file asynchronously** (read `SPECS.md` first):
> - Each top-level task lists a **suggested owner** — adjust in the team chat, then put your name here.
> - Branch per task: `feat/task-<n>-<slug>` (e.g. `feat/task-5-avatar-archive`). Merge to `main` via PR when your task's tests pass.
> - Code only against the contracts in `requirements.md` (endpoints, status codes, error strings are exact). Never call a real external API in dev/tests — `USE_MOCK_APIS=true`.
> - Definition of done per task: happy path + main error paths implemented, module unit tests pass, `npm run dev` still boots clean.
> - Integration gate at the end = Task 21 integration tests + Task 22.5 full-stack smoke test.
>
> | Task group | Suggested owner (confirm in chat) |
> |---|---|
> | 1–2 scaffolding + database, 9 Express wiring, 22 dev tooling | Zhi Feng |
> | 3–4 auth backend + OTP reset | Zhi Feng / Li Xiang |
> | 5 avatar archive backend, 8 query ticket backend | Li Xiang |
> | 6 GenAI upload pipeline (mocked first) | AI pipeline lead |
> | 7 PVE battle backend | Game lead |
> | 10–13 app shell, landing, auth UI, dashboard | Frontend lead |
> | 14–17 archive / upload / battle / contact UI | Frontend + respective feature owners |
> | 18–21 tests | Each feature owner writes their module's tests; testing lead consolidates |

## Task 1: Project Scaffolding & Monorepo Setup
Set up the full project structure for Sprout as a localhost-runnable monorepo with a React frontend (Vite) and a Node.js/Express backend.

- [x] 1.1 Initialise root `package.json` with workspaces for `client` and `server`
- [x] 1.2 Scaffold `client/` with Vite + React + TypeScript (`npm create vite@latest client -- --template react-ts`)
- [x] 1.3 Install frontend dependencies: `react-router-dom`, `axios`, `@tanstack/react-query`, `fast-check`, `jest`, `@testing-library/react`, `@testing-library/jest-dom`
- [x] 1.4 Scaffold `server/` with `package.json`, `app.ts`, and the full directory structure: `routes/`, `controllers/`, `services/`, `middleware/`, `models/`, `database/`, `utils/`, `tests/`
- [x] 1.5 Install backend dependencies: `express`, `jsonwebtoken`, `bcrypt`, `multer`, `joi`, `express-rate-limit`, `nodemailer`, `axios`, `uuid`, `cors`, `dotenv`, `jest`, `supertest`, `fast-check`
- [x] 1.6 Create root `.env.example` with all required environment variable keys (DB, JWT_SECRET, EMAIL, PLANTID_API_KEY, GEMMA_API_KEY, FLUX_API_KEY)
- [x] 1.7 Create `server/.env` with localhost-safe defaults (SQLite or in-memory DB, mock API flags)
- [x] 1.8 Set up ESLint + Prettier config for both `client/` and `server/`
- [x] 1.9 Add a root `package.json` `dev` script that starts both client and server concurrently

## Task 2: Database Layer & Models
Set up the database layer using SQLite (for localhost) with an ORM, and define all data models.

- [x] 2.1 Install `better-sqlite3` and `knex` (or `sequelize`) in `server/`
- [ ] 2.2 Create `server/database/db.ts` that initialises and exports a SQLite connection with WAL mode
- [~] 2.3 Create Knex migration for `users` table matching the `User` interface (id UUID, email, passwordHash, displayName, isVerified, verificationToken, resetOtpHash, resetOtpExpiresAt, createdAt, updatedAt)
- [~] 2.4 Create Knex migration for `avatar_records` table matching `AvatarRecord` (id, userId FK, speciesName, speciesFamily, spriteUrl, discoveredAt, source, isTemporary, expiresAt, stats JSON, metadata JSON)
- [~] 2.5 Create Knex migration for `battle_sessions` table matching `BattleSession` (sessionId, userId, userAvatarId, npcAvatar JSON, userCurrentHp, npcCurrentHp, turn, status, log JSON, startedAt, endedAt)
- [~] 2.6 Create Knex migration for `query_tickets` table matching `QueryTicket` (id, refNumber UNIQUE, name, email, category, message, status, createdAt, updatedAt)
- [~] 2.7 Create `server/database/seed.ts` that inserts sample users and avatar records for local development and testing
- [~] 2.8 Add `migrate` and `seed` npm scripts to `server/package.json`
- [ ] 2.9 Create Knex migration for `password_history` table (id, userId FK, passwordHash, changedAt) — retains last 3 hashes per user for the Req 3.9 reuse check

## Task 3: Authentication Backend (Signup, Login, Logout, Email Verify)
Implement all auth routes and controllers per Requirements 1 and 2.

- [~] 3.1 Create `server/middleware/auth.middleware.ts` — verifies JWT from `Authorization: Bearer` header, attaches `req.user`, returns 401 on failure
- [~] 3.2 Create `server/middleware/validation.middleware.ts` — generic Joi/Zod schema validation wrapper
- [~] 3.3 Create `server/services/email.service.ts` — Nodemailer SMTP wrapper; in dev mode logs emails to console instead of sending
- [~] 3.4 Create `server/controllers/auth.controller.ts` with `handleSignup`: validate input, check duplicate email, hash password (bcrypt cost 12), create user, send verification email, respond 201
- [~] 3.5 Add `handleVerifyEmail` to `auth.controller.ts`: find user by token, set `isVerified=true`, respond 200
- [~] 3.6 Add `handleLogin` to `auth.controller.ts`: validate credentials, check `isVerified`, sign JWT (1h expiry), respond 200 with token + displayName
- [~] 3.7 Add `handleLogout` to `auth.controller.ts`: invalidate JWT via in-memory or DB token blacklist, respond 200
- [~] 3.8 Create `server/routes/auth.routes.ts` and wire all auth endpoints with rate-limit middleware (10 attempts / 15 min / IP)
- [~] 3.9 Mount auth router in `server/app.ts` at `/api/auth`

## Task 4: Password Reset via OTP
Implement OTP-based password reset per Requirement 3.

- [~] 4.1 Add `handleRequestReset` to `auth.controller.ts`: generate 6-digit OTP via `crypto.randomInt`, hash with bcrypt, store hash + 15-min TTL on user record, send OTP email, respond 200 (even if email not found)
- [~] 4.2 Add `handleVerifyReset` to `auth.controller.ts`: look up user, check OTP TTL, compare OTP hash, validate new password strength, reject passwords found in `password_history` (Req 3.9), archive the old hash to `password_history` (Req 3.10), update password hash, clear OTP fields, respond 200
- [~] 4.3 Add `POST /request-reset` and `POST /verify-reset` to `auth.routes.ts`

## Task 5: Avatar Archive Backend
Implement avatar listing and detail routes per Requirement 5.

- [~] 5.1 Create `server/controllers/avatar.controller.ts` with `handleListAvatars`: verify JWT, query DB for user's avatars with pagination (page/pageSize query params, default 20), respond 200
- [~] 5.2 Add `handleGetAvatar` to `avatar.controller.ts`: verify ownership, respond with single AvatarRecord or 404
- [~] 5.3 Create `server/routes/avatar.routes.ts` with `GET /` and `GET /:avatarId` (all protected by auth middleware)
- [~] 5.4 Mount avatar router in `server/app.ts` at `/api/avatar`

## Task 6: GenAI Upload Pipeline Backend
Implement the plant image upload and GenAI pipeline per Requirements 6 and 7.

- [~] 6.1 Create `server/services/plantId.service.ts` — wraps HTTP call to PlantID API (or mock); timeout 10s; retry 2×; returns `{ species, confidence, taxonomy }`
- [~] 6.2 Create `server/services/gemma.service.ts` — wraps HTTP call to Gemma API (or mock); timeout 15s; retry 1×; returns `{ prompt }`
- [~] 6.3 Create `server/services/flux.service.ts` — wraps HTTP call to FLUX API (or mock); timeout 30s; retry 1×; returns `{ spriteUrl }`
- [~] 6.4 Create `server/utils/avatarStats.ts` — implements `deriveAvatarStats(speciesName, taxonomy)` as a pure function using deterministic hash + taxonomy modifiers per design algorithm
- [~] 6.5 Create `server/middleware/upload.middleware.ts` — Multer config: memory storage, 5 MB limit, JPEG/PNG/WEBP only (magic bytes check)
- [~] 6.6 Create `server/controllers/upload.controller.ts` with `handlePlantUpload`: validate file, call PlantID, check confidence threshold, call Gemma, call FLUX, derive stats, persist TempAvatar (isTemporary=true, TTL 24h), respond 200 with TempAvatarResult
- [~] 6.7 Add rollback logic: if any pipeline step fails, delete any partial DB record and respond 503
- [~] 6.8 Create `server/routes/upload.routes.ts` with `POST /plant` (auth + upload middleware + rate limit 5/hr/user)
- [~] 6.9 Mount upload router in `server/app.ts` at `/api/upload`
- [~] 6.10 Create mock service responses in `server/utils/mockServices.ts` for use when `USE_MOCK_APIS=true` in `.env`

## Task 7: PVE Battle Backend
Implement the PVE battle service and routes per Requirement 8.

- [~] 7.1 Create `server/services/battle.service.ts` with pure function `calculateDamage(attacker, defender, action)` — implement attack/special/defend logic, minimum 1 damage, deterministic
- [~] 7.2 Add `generateNpc(userAvatarStats)` to `battle.service.ts` — creates a balanced NPC opponent
- [~] 7.3 Add `selectNpcAction(npcStats, npcCurrentHp)` to `battle.service.ts` — heuristic: use special when HP > 70%, defend when HP < 30%, else attack
- [~] 7.4 Add `resolveBattleTurn(session, userAction)` to `battle.service.ts` — orchestrates user move, NPC counter-move, HP floor at 0, win/loss detection, log appending
- [~] 7.5 Create `server/controllers/battle.controller.ts` with `handleStartPve`: load avatar (or temp avatar), generate NPC, create BattleSession in DB, respond with initial state
- [~] 7.6 Add `handleBattleAction` to `battle.controller.ts`: load session, verify ownership + active status, call `resolveBattleTurn`, save session, respond with updated state
- [~] 7.7 Add `handleGetSession` to `battle.controller.ts`: return current session state for GET endpoint
- [~] 7.8 Create `server/routes/battle.routes.ts` with `POST /pve/start`, `POST /pve/action`, `GET /pve/:sessionId` (all protected)
- [~] 7.9 Mount battle router in `server/app.ts` at `/api/battle`

## Task 8: Query Ticket Backend
Implement the query ticket creation and email notification per Requirement 9.

- [~] 8.1 Create `server/services/ticket.service.ts` with `createTicket(data)`: validate category enum, generate unique `RefNumber` (`SPR-YYYYMMDD-NNNN` with atomic daily counter), persist QueryTicket, send confirmation + admin notification emails, return ticket
- [~] 8.2 Create `server/controllers/query.controller.ts` with `handleQuerySubmit`: validate input (name, email, category, message ≤ 2000 chars), call ticket service, respond 201 with refNumber
- [~] 8.3 Create `server/routes/query.routes.ts` with `POST /submit` (public route, no auth required)
- [~] 8.4 Mount query router in `server/app.ts` at `/api/query`

## Task 9: Express App Setup & Global Middleware
Wire all middleware, routers, and error handling into `server/app.ts`.

- [~] 9.1 Configure `cors` in `server/app.ts` to allow `http://localhost:5173` in development
- [~] 9.2 Add `express.json()` and `express.urlencoded({ extended: true })` middleware
- [~] 9.3 Add global `express-rate-limit` as a base limiter (1000 req/15 min globally)
- [~] 9.4 Create `server/middleware/error.middleware.ts` — catches errors from all routes, returns appropriate HTTP status and JSON error body
- [~] 9.5 Add a `GET /api/health` route that returns `{ status: "ok", timestamp }` for dev verification
- [~] 9.6 Create `server/server.ts` entry point that imports `app.ts`, runs migrations, and starts listening on `PORT` (default 3001)

## Task 10: Frontend Routing & App Shell
Set up React Router, app shell, and global state/auth context.

- [~] 10.1 Create `client/src/App.tsx` with `BrowserRouter` and route definitions for `/`, `/login`, `/signup`, `/reset-password`, `/dashboard`, `/avatars`, `/avatars/:id`, `/upload`, `/battle/pve`, `/contact`
- [~] 10.2 Create `client/src/context/AuthContext.tsx` — stores JWT token and user info in `localStorage`; provides `login`, `logout`, `isAuthenticated` helpers
- [~] 10.3 Create `client/src/components/common/ProtectedRoute.tsx` — redirects to `/login` if not authenticated
- [~] 10.4 Create `client/src/components/common/Navbar.tsx` — responsive nav with links that change based on auth state
- [~] 10.5 Create `client/src/components/common/LoadingSpinner.tsx` — reusable spinner component
- [~] 10.6 Create `client/src/components/common/ErrorMessage.tsx` — reusable error display component
- [~] 10.7 Configure Axios base URL (`http://localhost:3001`) and JWT interceptor in `client/src/services/apiClient.ts`

## Task 11: Landing Page
Build the landing page per Requirement 4.

- [~] 11.1 Create `client/src/pages/LandingPage.tsx` — hero section with tagline "Scan. Grow. Battle.", feature highlights, call-to-action buttons
- [~] 11.2 Add signup CTA button navigating to `/signup`
- [~] 11.3 Add login nav link in Navbar
- [~] 11.4 Add Contact Us nav link
- [~] 11.5 Show Dashboard link in Navbar when authenticated
- [~] 11.6 Add basic CSS/Tailwind styling to make the landing page visually presentable

## Task 12: Authentication Frontend (Signup, Login, Reset Password)
Build all auth pages using the `AuthForm` component pattern per Requirements 1–3.

- [~] 12.1 Create `client/src/components/auth/AuthForm.tsx` — reusable form with `mode` prop ("login" | "signup" | "reset-request" | "reset-verify"), client-side validation, loading/error states
- [~] 12.2 Create `client/src/pages/SignupPage.tsx` — uses AuthForm in signup mode; calls `POST /api/auth/signup`; shows "check your inbox" on success
- [~] 12.3 Create `client/src/pages/LoginPage.tsx` — uses AuthForm in login mode; calls `POST /api/auth/login`; stores JWT in AuthContext; redirects to dashboard
- [~] 12.4 Create `client/src/pages/ResetPasswordPage.tsx` — two-step: request OTP (email only), then verify OTP + new password; uses AuthForm modes
- [~] 12.5 Create `client/src/services/authApi.ts` — typed wrappers for signup, login, logout, requestReset, verifyReset API calls

## Task 13: Dashboard Page
Build the user dashboard per the design spec.

- [~] 13.1 Create `client/src/pages/DashboardPage.tsx` — protected route; shows welcome message with displayName; links to Avatar Archive, Upload Plant, Start PVE Battle, Contact

## Task 14: Avatar Archive Frontend
Build the Pokédex-style avatar archive grid per Requirement 5.

- [~] 14.1 Create `client/src/components/avatar/AvatarCard.tsx` — displays sprite, species name, discovery date; optional stats display; onClick handler
- [~] 14.2 Create `client/src/components/avatar/AvatarDetailModal.tsx` — modal showing full avatar details including HP/ATK/DEF/SPD stats and species family
- [~] 14.3 Create `client/src/pages/AvatarArchivePage.tsx` — protected page; fetches paginated avatar list via `GET /api/avatar`; renders AvatarCard grid; handles empty state; pagination controls
- [~] 14.4 Create `client/src/services/avatarApi.ts` — typed wrappers for listAvatars (with page/pageSize), getAvatar

## Task 15: Upload Plant Frontend
Build the plant upload page with pipeline progress indicators per Requirement 6.

- [~] 15.1 Create `client/src/components/upload/UploadPlantForm.tsx` — file input (JPEG/PNG/WEBP only, 5 MB limit), preview thumbnail, client-side validation, submit button
- [~] 15.2 Create `client/src/components/upload/PipelineProgress.tsx` — shows stage labels: "Identifying plant…" → "Generating prompt…" → "Creating sprite…" → "Done"
- [~] 15.3 Create `client/src/pages/UploadPlantPage.tsx` — protected page; integrates UploadPlantForm and PipelineProgress; on success shows generated avatar and "Use in Battle" button
- [~] 15.4 Create `client/src/services/uploadApi.ts` — `uploadPlant(file: File)` using FormData + axios with 60s timeout

## Task 16: PVE Battle Frontend
Build the PVE battle screen per Requirement 8.

- [~] 16.1 Create `client/src/components/battle/BattleArena.tsx` — displays both avatar sprites, animated HP bars (colour changes at low HP), action buttons (Attack / Special / Defend), turn log
- [~] 16.2 Create `client/src/components/battle/AvatarSelector.tsx` — lets user pick from their archive or use a temp avatar before starting battle
- [~] 16.3 Create `client/src/components/battle/BattleOutcomeModal.tsx` — shows win/loss result and any rewards
- [~] 16.4 Create `client/src/pages/PVEBattlePage.tsx` — protected page; avatar selection → battle → outcome flow
- [~] 16.5 Create `client/src/services/battleApi.ts` — typed wrappers for startPve, submitAction, getSession

## Task 17: Contact / Query Ticket Frontend
Build the Contact Us page per Requirement 9.

- [~] 17.1 Create `client/src/components/query/QueryTicketForm.tsx` — collects name, email, category (dropdown: general/bug/billing/partnership/other), message (max 2000 chars); client-side validation; shows character count
- [~] 17.2 Create `client/src/pages/ContactPage.tsx` — public page; integrates QueryTicketForm; shows confirmation with RefNumber on success
- [~] 17.3 Create `client/src/services/queryApi.ts` — `submitTicket(data)` wrapper

## Task 18: Backend Unit Tests
Write Jest unit tests for all P0 backend modules per Requirements 7 and 13.

- [~] 18.1 Create `server/tests/auth.test.ts` — test signup validation (valid, duplicate email, weak password, malformed email), login (valid, wrong password, rate limit simulation), OTP flow (generate, verify, expired, invalid)
- [~] 18.2 Create `server/tests/upload.test.ts` — test file format validation, size validation, PlantID mock success/failure/low-confidence, Gemma mock, FLUX mock, pipeline rollback on failure
- [~] 18.3 Create `server/tests/battle.test.ts` — test `calculateDamage` (attack/special/defend), `generateNpc`, `selectNpcAction`, `resolveBattleTurn` (win/loss detection, HP floor), `deriveAvatarStats` range bounds
- [~] 18.4 Create `server/tests/query.test.ts` — test ticket creation, RefNumber format, duplicate prevention, field validation (missing fields, long message, invalid category)
- [~] 18.5 Create `server/tests/avatar.test.ts` — test avatar list retrieval (paginated, empty), ownership check (other user's avatar returns 403/404)

## Task 19: Property-Based Tests
Implement `fast-check` property-based tests per Requirements 7.4–7.5, 8.6–8.7, 8.12, 9.10, and design Properties 1–8.

- [~] 19.1 Create `server/tests/pbt/avatarStats.pbt.test.ts` — Property 1 (stats within bounds for all species/taxonomy combos) + Property 2 (determinism)
- [~] 19.2 Create `server/tests/pbt/battleDamage.pbt.test.ts` — Property 3 (damage ≥ 1 and deterministic for attack/special) + Property 4 (HP never drops below 0 across action sequences)
- [~] 19.3 Create `server/tests/pbt/ticketRef.pbt.test.ts` — Property 5 (unique RefNumbers for n submissions per day)
- [~] 19.4 Create `server/tests/pbt/auth.pbt.test.ts` — Property 7 (passwords never stored in plaintext) + Property 8 (invalid JWT always returns 401)

## Task 20: Frontend Component Tests
Write Jest + React Testing Library tests for key frontend components.

- [~] 20.1 Create `client/src/tests/AuthForm.test.tsx` — test all validation modes, error display, loading state
- [~] 20.2 Create `client/src/tests/UploadPlantForm.test.tsx` — test file type rejection, size rejection, preview render, submit flow
- [~] 20.3 Create `client/src/tests/BattleArena.test.tsx` — test HP bar rendering, action button clicks, turn log rendering, outcome modal
- [~] 20.4 Create `client/src/tests/QueryTicketForm.test.tsx` — test required field validation, email format validation, category dropdown, character count

## Task 21: Integration Tests
Write Supertest integration tests for complete user flows per design Testing Strategy.

- [~] 21.1 Create `server/tests/integration/auth.integration.test.ts` — Signup → verify email → login → receive JWT → access protected route
- [~] 21.2 Create `server/tests/integration/avatar.integration.test.ts` — Login → GET avatar archive → verify avatars match seeded DB records
- [~] 21.3 Create `server/tests/integration/pve.integration.test.ts` — Login → select avatar → start PVE session → submit 3 actions → session concludes
- [~] 21.4 Create `server/tests/integration/upload.integration.test.ts` — Login → upload plant (mocked pipeline) → receive TempAvatar → use in PVE
- [~] 21.5 Create `server/tests/integration/query.integration.test.ts` — Submit ticket → ticket created → refNumber returned → confirmation email logged

## Task 22: Dev Tooling & Final Wiring
Final localhost dev experience polish and verification.

- [~] 22.1 Add `concurrently` to root package.json and set up `npm run dev` to start both Vite dev server (port 5173) and Express server (port 3001) simultaneously
- [~] 22.2 Add `npm run test` scripts in both `client/` and `server/` to run Jest
- [~] 22.3 Add `npm run migrate` and `npm run seed` scripts in `server/`
- [~] 22.4 Create a top-level `README.md` with setup instructions: clone → `npm install` → `npm run migrate` → `npm run seed` → `npm run dev`
- [~] 22.5 Verify the full localhost stack starts cleanly: `npm run dev` → frontend at `http://localhost:5173`, backend at `http://localhost:3001`, health check at `http://localhost:3001/api/health`
