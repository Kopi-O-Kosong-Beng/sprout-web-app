# SPECS — How This Project Is Specified & Built

**Sprout Web Platform · 50.003 ESC · Cohort 3 Team 2**
This folder is the single workspace for the app. Three spec documents drive everything; code lives in `client/` and `server/` beside them.

> ✅ **Backend + database are set up and working** (TypeScript + Cloud Firestore). Frontend teammates: go straight to [`FRONTEND_HANDOFF.md`](FRONTEND_HANDOFF.md).

## The three documents (read in this order)

| File | Role | When you touch it |
|---|---|---|
| [`requirements.md`](requirements.md) | **WHAT** — EARS acceptance criteria for every P0 feature; exact endpoints, status codes, error strings, limits. **Source of truth in any conflict** (see its Appendix B). | Read before coding a feature; propose changes via team chat, then PR |
| [`process.md`](process.md) | **WHY & HOW** — product context, priorities (P0/P1/P2), architecture, testing strategy, risks, sprint plan, post-Checkoff-1 decisions (§14) | Reference; update §14 when the prof gives new feedback |
| [`tasks.md`](tasks.md) | **ORDER** — 22 tasks with checkboxes and suggested owners | Tick your boxes as you complete subtasks; put your name on your task group |

## Ground rules for async work

1. **The contract is the spec, not the chat.** If requirements.md says HTTP 409 + `"An account with this email already exists."`, that exact status + string is what the tests will assert.
2. **Branch per task** — `feat/task-<n>-<slug>`; PR to `main` when your task's unit tests pass and `npm run dev` boots clean.
3. **Mock everything external.** `USE_MOCK_APIS=true` in `.env` — no live plant.id/Gemma/FLUX/email in dev or tests. Real integration happens once, in the PM3 window (tasks 6.x with mocks first).
4. **Never commit secrets.** API keys only in `server/.env` (gitignored); `.env.example` documents the keys.
5. **Definition of done** (per feature): happy path + main error paths work, module unit tests pass, user-facing errors readable, no critical console/server errors.
6. **Integration is an event, not a hope:** the final merge gate is Task 21 (Supertest integration flows) + Task 22.5 (full localhost smoke: frontend :5173 → backend :3001 → `GET /api/health`).

## Stack (decided 8 Jul 2026 — authority: Master.docx + team chat; this supersedes older drafts)

React + Vite + TS (client) · Node + Express (server) · **Cloud Firestore** via Firebase Admin SDK — the cross-platform database shared with the mobile app (SQLite repo impl remains as offline fallback + unit-test path) · **Firebase Auth** — frontend signs in with the Firebase JS SDK (email/password + Google), backend verifies ID tokens; **custom 6-digit OTP reset kept for UC3** (implemented on Firebase via Admin SDK) · Cloud Storage for sprite images (PM3) · Jest/Supertest/fast-check · Vercel later, no CI/CD needed.

**Architecture rule:** all persistence goes through `server/repositories/*` (the datastore seam) — services and controllers never import Knex or Firestore directly. Clients (web AND mobile) never touch the database; everything is a backend API call (Checkoff 1 feedback). Backend setup for Firebase: `server/FIREBASE_SETUP.md`.

> ⚠️ `requirements.md` Req 1–3 and Req 11 still describe the older custom-JWT auth design — they are being rewritten to the Firebase Auth + OTP-on-Firebase design as the auth endpoints land. Where they conflict with this section, this section wins.

## Key numbers (memorise these, tests assert them)

- Upload: JPEG/PNG/WEBP, ≤ 5 MB, magic-byte check, 5/user/hour
- Login rate limit: 10 / 15 min / IP · JWT expiry 1 h
- OTP: 6 digits, bcrypt-hashed, 15 min TTL · password history: last 3
- Plant-ID confidence threshold: 0.70 · TempAvatar TTL: 24 h
- Ticket ref: `SPR-YYYYMMDD-NNNN`, unique per day · message ≤ 2000 chars, category ∈ {general, bug, billing, partnership, other}
- API timeouts: plant.id 10s ×2 retries · Gemma 15s ×1 · FLUX 30s ×1
- Battle: special = 1.5× floor · defend = 0.5× incoming · min damage 1 · HP floor 0 · stats hp[1,200] atk/def/spd[1,100], deterministic

## Milestones

PM2 video **12 Jul 2026** (backend demo: health ping + form→DB) · PM3 video **26 Jul** (features + tests demo) · Final Week 13 (full suites + fuzzer + report).

*Extended knowledge bank (diagrams, feedback log, Q&A, rubrics): ask Zhi Feng for the `Sprout_Vault` Obsidian folder — optional but useful.*
