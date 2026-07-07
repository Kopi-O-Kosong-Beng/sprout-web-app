# 🌱 Sprout Web App

**Scan. Grow. Battle.** — the web platform for Sprout (50.003 ESC, Cohort 3 Team 2): auth, Pokédex-style plant avatar archive, GenAI sprite pipeline, PVE battles, and a contact/query-ticket system, backed by a Node.js/Express API.

This README assumes **zero prior setup** — follow it top to bottom and you'll have the backend running locally in ~10 minutes. If something breaks, check [Common problems](#common-problems) before pinging the chat.

---

## 0. What's in this repo?

```
sprout-app/
├── SPECS.md           ← START HERE: how the 3 spec docs work + ground rules
├── requirements.md    ← WHAT to build (exact endpoints, status codes, error strings)
├── process.md         ← WHY (product context, priorities, prof feedback decisions §14)
├── tasks.md           ← ORDER (22 tasks with checkboxes + suggested owners)
├── test.html          ← throwaway browser form for poking the API by hand
├── server/            ← the Express backend (working — see below)
└── client/            ← the React frontend (not created yet — Task 10+)
```

**Read `SPECS.md` first.** It explains which document wins when they disagree and the rules for working in parallel without stepping on each other.

## 1. Prerequisites (one-time)

| Tool | Check if you have it | If not |
|---|---|---|
| **Node.js ≥ 20** | run `node --version` in a terminal | install the LTS from https://nodejs.org |
| **Git** | `git --version` | https://git-scm.com/downloads |
| A terminal | PowerShell (Windows) / Terminal (Mac) | built-in |
| **Postman** *(optional)* | — | https://www.postman.com/downloads — nice GUI for testing APIs |

> **Windows note:** if `node` isn't recognised after installing, close and reopen your terminal.

## 2. Get it running (copy-paste these)

```bash
# 1. clone and enter
git clone https://github.com/Kopi-O-Kosong-Beng/sprout-web-app.git
cd sprout-web-app

# 2. install dependencies (takes a minute)
npm install

# 3. create your local config file
#    copy .env.example to server/.env  (Windows PowerShell: )
cp .env.example server/.env

# 4. create the local database tables + demo data
npm run migrate
npm run seed

# 5. start the backend
npm run dev
```

You should see:

```
Sprout backend listening on http://localhost:3001
Health check: http://localhost:3001/api/health
```

**Verify it works:** open http://localhost:3001/api/health in your browser → you should see `{"status":"ok","timestamp":"..."}`. 🎉

> `cp` not working on Windows? Just copy the file in File Explorer: duplicate `.env.example`, move it into `server/`, rename it to `.env` (exactly — no `.txt` at the end).

## 3. Try the API

**Easiest:** open `test.html` in this repo with VS Code's *Live Server* extension (right-click → "Open with Live Server"). It's a real form that submits a query ticket to your local backend and shows the response.

**Or with Postman / curl:**

```bash
curl -X POST http://localhost:3001/api/query/submit \
  -H "Content-Type: application/json" \
  -d '{"name":"Your Name","email":"you@example.com","category":"general","message":"hello"}'
```

→ returns `201 {"refNumber":"SPR-20260712-0001"}` and the row is now in the database.

**Seeded demo data** (created by `npm run seed`): user `demo@sprout.app` (password `Password123!`) with 5 plant avatars, ready for the avatar-archive endpoints.

**Run the tests:** `npm test` — 7 Jest/Supertest tests covering the ticket flow. They use a throwaway test database, never your dev data.

## 4. Current API (more coming — check back)

| Method | Endpoint | Auth | What it does |
|---|---|---|---|
| GET | `/api/health` | — | liveness ping |
| POST | `/api/query/submit` | — | create query ticket → `{refNumber}` |
| *(next)* | `/api/avatar`, `/api/auth/*`, `/api/battle/*` | Bearer token | per `requirements.md` |

The **exact** request/response contracts (status codes, error strings, limits like "5 MB", "10 attempts / 15 min") live in `requirements.md` — the tests assert those exact values, so code against the doc, not from memory.

## 5. The database story (IMPORTANT — read once)

The **final architecture is Firebase** (Firestore + Firebase Auth + Cloud Storage) — it's the real cross-platform database shared with the Sprout mobile app. But you don't need any Firebase setup to develop:

- Out of the box, `server/.env` has `DATASTORE=sqlite` → a local SQLite file, zero accounts needed. This is fine for most frontend/feature work.
- When you need the real thing: get `serviceAccountKey.json` **from Zhi Feng privately** (it's a secret — never commit it, never post it in the group chat), drop it in `server/`, and set `DATASTORE=firestore` in `server/.env`. Full steps: [`server/FIREBASE_SETUP.md`](server/FIREBASE_SETUP.md).
- All persistence goes through `server/repositories/` — **never** import Knex/Firestore directly in a service or controller. That seam is what makes the two datastores interchangeable.

**Auth (for frontend work):** users sign in with the **Firebase JS SDK** in the React app (email/password + Google), grab the ID token, and send it as `Authorization: Bearer <idToken>` on every API call. The exact snippet is in `server/FIREBASE_SETUP.md` § "For the frontend teammate".

## 6. Backend layout (where to put things)

```
server/
├── app.ts              ← Express wiring (CORS, rate limit, routers, error handler)
├── server.ts           ← entry point (migrations + listen on :3001)
├── routes/             ← URL definitions + validation schemas
├── controllers/        ← request/response handling, no business logic
├── services/           ← business logic (ticket refs, emails, battle math…)
├── repositories/       ← the ONLY place that touches the database
├── middleware/         ← auth (Firebase ID tokens), validation, errors
├── database/           ← SQLite fallback: migrations + seeds
└── tests/              ← Jest + Supertest
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
| `no such table: query_tickets` | You skipped `npm run migrate` |
| test.html says "Backend not reachable" | Backend isn't running (`npm run dev`), or it's on a different port |
| "Failed to fetch" in browser but Postman works | CORS — dev server allows origins `:5173` and `:5500` only; serve your page from one of those (Vite / Live Server) |
| `.env` questions | Never commit `server/.env` or `serviceAccountKey.json`. They're gitignored on purpose. `.env.example` shows what keys exist |

Still stuck? Screenshot the **full** terminal error (not just the last line) into the group chat.

## Related repos

- 📚 **[sprout-knowledge-base](https://github.com/Kopi-O-Kosong-Beng/sprout-knowledge-base)** — the team's Obsidian vault: rubrics, use cases, design decisions, prof feedback, Q&As. When you wonder "why is it built this way?", the answer is there.
