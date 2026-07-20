# 🌱 Sprout Web App

**Scan. Grow. Battle.** — the web platform for Sprout (50.003 ESC, Cohort 3 Team 2): auth, Pokédex-style plant avatar archive, GenAI sprite pipeline, PVE battles, and a contact/query-ticket system. **Stack: TypeScript everywhere** — React + Vite (frontend) and Node.js + Express (backend), with **Cloud Firestore** as the database (Firebase Auth for login).

> 👉 **Building the frontend? Read [`FRONTEND_HANDOFF.md`](FRONTEND_HANDOFF.md) first** — it's the fast path: run the backend, call the API, done.

This README assumes **zero prior setup** — follow it top to bottom and you'll have the backend running locally in ~10 minutes. If something breaks, check [Common problems](#common-problems) before pinging the chat.

> **Deploying or explaining hosting? Read [`DEPLOYMENT.md`](DEPLOYMENT.md)** for the simple Vercel + Render setup, env vars, CORS, and demo auth bypass.

---

## 0. What's in this repo?

```
sprout-app/
├── SPECS.md           ← START HERE: how the 3 spec docs work + ground rules
├── requirements.md    ← WHAT to build (exact endpoints, status codes, error strings)
├── process.md         ← WHY (product context, priorities, prof feedback decisions §14)
├── tasks.md           ← ORDER (22 tasks with checkboxes + suggested owners)
├── FRONTEND_HANDOFF.md ← frontend teammates: your fast-start guide
├── DEPLOYMENT.md       ← production hosting guide (Vercel + Render)
├── firestore.rules     ← Firestore security rules (deny-all; backend-only access)
├── test.html          ← throwaway browser form for poking the API by hand
├── server/            ← the Express + TypeScript backend (working — see below)
└── client/            ← the React + Vite frontend
```

**Read `SPECS.md` first.** It explains which document wins when they disagree and the rules for working in parallel without stepping on each other.

**Everything is TypeScript.** The backend runs directly from `.ts` files via `tsx` (no build step in dev); tests use `ts-jest`. `npm run typecheck` in `server/` checks types without running.

## 1. Prerequisites (one-time)

| Tool | Check if you have it | If not |
|---|---|---|
| **Node.js 22 LTS** | run `node --version` in a terminal | install the LTS from https://nodejs.org |
| **Git** | `git --version` | https://git-scm.com/downloads |
| A terminal | PowerShell (Windows) / Terminal (Mac) | built-in |
| **Postman** *(optional)* | — | https://www.postman.com/downloads — nice GUI for testing APIs |

> **Windows note:** if `node` isn't recognised after installing, close and reopen your terminal.

## 2. First-time local setup

Follow this when you clone the repo for the first time.

### Step 1: Clone and install

```bash
git clone https://github.com/Kopi-O-Kosong-Beng/sprout-web-app.git
cd sprout-web-app
npm install
```

This installs dependencies for both workspaces:

```text
client/
server/
```

### Step 2: Create backend env file

Copy the root example env into `server/.env`:

```bash
cp .env.example server/.env
```

Windows option: copy `.env.example` in File Explorer, paste it inside
`server/`, then rename it to `.env`.

Pick one datastore:

| Option | When to use | What to do |
|---|---|---|
| Firestore | Real shared backend data | Get `serviceAccountKey.json` privately from Zhi Feng, put it in `server/`, set `DATASTORE=firestore` in `server/.env` |
| SQLite | Offline local testing | Set `DATASTORE=sqlite` in `server/.env`, then run `npm run migrate && npm run seed` |

For local frontend work before Firebase login is implemented, keep this in
`server/.env`:

```text
AUTH_DEV_BYPASS=true
```

That lets local requests use:

```text
x-dev-uid: demo-user-0001
```

If Firestore is empty, seed it with:

```bash
npm run seed:firestore -w server
```

To make the auth test panel login as the seeded avatar owner, also run:

```bash
npm run seed:firebase-auth-demo -w server
```

Demo login:

```text
email: demo@sprout.app
password: Password123!
```

### Step 3: Create frontend env file

Copy the frontend example env:

```bash
cp client/.env.example client/.env.local
```

Windows option: copy `client/.env.example`, paste it in `client/`, then rename
the copy to `.env.local`.

For local development, `client/.env.local` should contain:

```text
VITE_API_URL=http://localhost:3001
VITE_FIREBASE_API_KEY=<from Firebase web app config>
VITE_FIREBASE_AUTH_DOMAIN=<from Firebase web app config>
VITE_FIREBASE_PROJECT_ID=<from Firebase web app config>
VITE_FIREBASE_APP_ID=<from Firebase web app config>
```

`VITE_API_URL` tells the Vite frontend where the local backend is running. The
`VITE_FIREBASE_*` values are the Firebase **web app config**, not the secret
service account. They are safe for frontend code and are needed for the auth
test panel.

### Step 4: Start the backend

In terminal 1:

```bash
npm run dev:server
```

You should see:

```text
Sprout backend listening on http://localhost:3001
Health check: http://localhost:3001/api/health
```

Verify backend:

```text
http://localhost:3001/api/health
```

Expected:

```json
{ "status": "ok", "timestamp": "..." }
```

### Step 5: Start the frontend

In terminal 2:

```bash
npm run dev:client
```

Vite should print a local URL, usually:

```text
http://localhost:5173
```

Open that URL in the browser.

### Step 6: Quick local checks

Backend health should work:

```bash
curl http://localhost:3001/api/health
```

Query submit should return a ticket reference:

```bash
curl -X POST http://localhost:3001/api/query/submit \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Local Smoke\",\"email\":\"local@example.com\",\"category\":\"general\",\"message\":\"Local setup test\"}"
```

Avatar demo data should work while `AUTH_DEV_BYPASS=true`:

```bash
curl http://localhost:3001/api/avatar -H "x-dev-uid: demo-user-0001"
```

See the database anytime:

```bash
npm run inspect -w server
```

## 3. Try the API

**Easiest:** open `test.html` in this repo with VS Code's *Live Server* extension (right-click → "Open with Live Server"). It's a real form that submits a query ticket to your local backend and shows the response.

**Or with Postman / curl:**

```bash
curl -X POST http://localhost:3001/api/query/submit \
  -H "Content-Type: application/json" \
  -d '{"name":"Your Name","email":"you@example.com","category":"general","message":"hello"}'
```

→ returns `201 {"refNumber":"SPR-20260712-0001"}` and the row is now in the database.

**Seeded demo data:** user `demo@sprout.app` (id `demo-user-0001`) with 5 plant avatars, ready for the avatar-archive endpoints. Reseed with `npm run seed:firestore` (Firestore) or `npm run seed` (SQLite).

**Try a protected endpoint** (avatar archive) — during dev you can stand in for the demo user with one header, no login needed:

```bash
curl http://localhost:3001/api/avatar -H "x-dev-uid: demo-user-0001"
```

→ returns the 5 seeded avatars. (This dev shortcut needs `AUTH_DEV_BYPASS=true` in `server/.env`; it's off in production. See [`FRONTEND_HANDOFF.md`](FRONTEND_HANDOFF.md) §3.)

**Run the tests:** `npm test` — 7 Jest/Supertest tests covering the ticket flow. They run on a throwaway SQLite database, never your dev data.

## 4. Current API (more coming — check back)

| Method | Endpoint | Auth | What it does |
|---|---|---|---|
| GET | `/api/health` | — | liveness ping |
| POST | `/api/auth/signup` | — | create Firebase Auth user + profile |
| GET | `/api/auth/me` | Bearer token | current authenticated profile |
| POST | `/api/auth/request-reset` | — | send 6-digit OTP via email log/SMTP |
| POST | `/api/auth/verify-reset` | — | verify OTP and update password |
| POST | `/api/query/submit` | — | create query ticket → `{refNumber}` |
| GET | `/api/avatar` | yes | list caller's avatars (paginated) |
| GET | `/api/avatar/:id` | yes | one avatar (ownership-checked) |
| *(next)* | `/api/upload/plant`, `/api/battle/*` | Bearer token | per `requirements.md` |

The **exact** request/response contracts (status codes, error strings, limits like "5 MB", "10 attempts / 15 min") live in `requirements.md` — the tests assert those exact values, so code against the doc, not from memory. Frontend integration details: [`FRONTEND_HANDOFF.md`](FRONTEND_HANDOFF.md).

## 5. The database story (IMPORTANT — read once)

The **database is Cloud Firestore** (Firebase) — the real cross-platform database shared with the Sprout mobile app. It's already set up and connected. Two ways to run it:

- **Firestore** — set `DATASTORE=firestore` and put `serviceAccountKey.json` in `server/`. Get the key **from Zhi Feng privately** (it's a secret — never commit it, never post it in the group chat).
- **SQLite** — set `DATASTORE=sqlite`, run `npm run migrate && npm run seed`. A local file, zero accounts, no internet. Perfect for offline work; it's also what the automated tests use.
- All persistence goes through `server/repositories/` — **never** import Knex/Firestore directly in a service or controller. That seam is what makes the two datastores interchangeable (the same API code runs on both). Full Firebase steps: [`server/FIREBASE_SETUP.md`](server/FIREBASE_SETUP.md).

**Auth (for frontend work):** users sign in with the **Firebase JS SDK** in the React app, grab the ID token, and send it as `Authorization: Bearer <idToken>` on every protected API call. The current demo flow uses email/password; other Firebase sign-in providers can be added later without changing the backend token-verification pattern.

## Production auth, email, and storage

Render declares SMTP delivery but does not store credentials in `render.yaml`. For `hello.sprout.team@gmail.com`, enable Google 2-Step Verification, create a Google Account -> Security -> App passwords entry named `Sprout Backend`, and place the resulting 16-character app password only in local `server/.env` (`SMTP_PASS`) and Render's secret environment dashboard. With it configured, run `npm.cmd run check:email -w server`; a live SMTP preflight is successful only when it prints `[email-check] mode=smtp verified=true`.

Before deployment, add the Vercel domain in Firebase Console -> Authentication -> Settings -> Authorized domains and set Render `FRONTEND_URL` to that HTTPS origin. Verification links must point to `https://<vercel-domain>/verify-email?...`, and the page must successfully apply the Firebase action code. Firebase remains the authority for identity: the client sends Firebase ID tokens and the backend verifies them.

Firebase Storage is pending activation. In project `sprout-dev-66f08`, link Blaze billing, create budget alerts (alerts are not caps), create Storage deliberately in the Firestore/backend region where possible, publish restrictive rules, and set `FIREBASE_STORAGE_BUCKET`. Then run `npm.cmd run check:storage -w server` and keep `STORAGE_MODE=local` until it passes. This Admin SDK probe verifies backend credentials and bucket access, not client Security Rules. The detailed procedure is in [`server/FIREBASE_SETUP.md`](server/FIREBASE_SETUP.md).

## 6. Backend layout (where to put things)

```
server/
├── app.ts              ← Express wiring (CORS, rate limit, routers, error handler)
├── server.ts           ← entry point (migrations + listen on :3001)
├── routes/             ← URL definitions + validation schemas
├── controllers/        ← request/response handling, no business logic
├── services/           ← business logic (ticket refs, emails, battle math…)
├── repositories/       ← the ONLY place that touches the database (Firestore + SQLite impls)
├── models/             ← TypeScript domain types + repository interfaces
├── middleware/         ← auth (Firebase ID tokens), validation, errors
├── database/           ← SQLite fallback (migrations/seeds) + shared seed data + Firestore seed
├── scripts/            ← inspect-db and other dev utilities
├── firebase.ts         ← Firebase Admin SDK init (lazy)
└── tests/              ← Jest + Supertest (ts-jest)
```

Rule of thumb: routes stay thin → controllers translate HTTP → services do the thinking → repositories do the storing.

## 7. Team workflow

1. Claim your task in `tasks.md` (suggested owners are at the top) — put your name
2. Branch: `git checkout -b feat/task-<n>-<slug>` (e.g. `feat/task-14-avatar-archive-ui`)
3. Code against `requirements.md`; mock external APIs (`USE_MOCK_APIS=true` — never call real plant.id/Gemma/FLUX in dev)
4. Done = happy path + error paths work, your module's tests pass, `npm run dev` still boots
5. Push your branch → open a Pull Request on GitHub → someone else eyeballs it → merge
6. `git pull` main regularly so integration stays boring

## Common problems

| Symptom | Fix |
|---|---|
| `EADDRINUSE :::3001` on start | Something else is on port 3001. Either stop it, or run with another port: `PORT=3002 npm run dev` (PowerShell: `$env:PORT=3002; npm run dev`) — remember your frontend/test.html then needs the new port |
| `'node' is not recognized` | Install Node LTS, then **reopen** the terminal |
| `Cannot find module ...` | You skipped `npm install`, or you're in the wrong folder — run it from the repo root |
| `no such table: query_tickets` | SQLite mode and you skipped `npm run migrate` |
| Startup error mentioning Firebase / credentials | `DATASTORE=firestore` but `serviceAccountKey.json` is missing — add the key, or switch to `DATASTORE=sqlite` |
| `The query requires an index` from Firestore | shouldn't happen with current code (we sort in-memory); if a new query hits it, click the link in the error to create the index, or sort in the app |
| `401 Unauthorised` on `/api/avatar` | preferred: login in the auth test panel and send the Firebase ID token. Fallback: send `x-dev-uid: demo-user-0001` in dev with `AUTH_DEV_BYPASS=true` |
| test.html says "Backend not reachable" | Backend isn't running (`npm run dev`), or it's on a different port |
| "Failed to fetch" in browser but Postman works | CORS — dev server allows origins `:5173` and `:5500` only; serve your page from one of those (Vite / Live Server) |
| `.env` questions | Never commit `server/.env` or `serviceAccountKey.json`. They're gitignored on purpose. `.env.example` shows what keys exist |

Still stuck? Share only the minimal relevant, sanitized error lines. Redact tokens, OTPs, email addresses, environment values, local paths, and service-account details before posting anything to the group chat.

## Related repos

- 📚 **[sprout-knowledge-base](https://github.com/Kopi-O-Kosong-Beng/sprout-knowledge-base)** — the team's Obsidian vault: rubrics, use cases, design decisions, prof feedback, Q&As. When you wonder "why is it built this way?", the answer is there.
