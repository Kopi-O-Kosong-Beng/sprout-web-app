---
tags: [meeting, checkoff2, plan]
due: 2026-07-12 (video), Week 9 (checkoff with client)
---

# Checkoff 2 (PM2) — Step-by-Step Plan

> [!warning] Video due **Sun 12 Jul 2026, 23:59** (~1%) · checkoff with prof Week 9 (~4%). Today = Mon 7 Jul → 5 working days.

> [!success] Consultation completed on 2026-07-16. Cleaned feedback and follow-up actions are in [[Checkoff 2 Consultation Minutes]].

## Rubric → deliverable → suggested owner

| Rubric item (1% each) | Deliverable | Owner (suggested from PM1 split) |
|---|---|---|
| Changes in requirement | Written change log = [[Checkoff 1 Feedback]] applied | Justin (+ anyone) |
| Formal use case documentation | Revised UC doc + **redrawn diagram** (UC3 standalone, DB internal, canonical numbering) | Justin (doc) + Omar (diagram) |
| Initial design | [[Domain Model]] class diagram (add operations + SPD) + 2–3 [[Sequence Diagram Plan]] diagrams | Omar / Andrina |
| Implementation demo | **Backend running: health ping + form → DB row** (below) | **Zhi Feng** (+ Li Xiang) |
| Feature progress records | Workload table w/ commits & doc refs | Andrina / Nat |

## Zhi Feng's build plan — "database backend + demo pinging"

Work in `sprout-app/` following `tasks.md`. Milestone = the rubric sentence: *"making API call with an expected output, submit form to update database."*

### Day 1–2 (Mon 7 – Tue 8 Jul): foundation
1. Confirm where the Task-1 scaffold lives (tasks.md marks 1.1–1.9 done — if that repo isn't shared yet, re-scaffold in `sprout-app/`: root workspaces + `client/` Vite react-ts + `server/` structure)
2. **Task 2** — database layer: `db.js` (SQLite WAL) → Knex migrations for `users`, `avatar_records`, `battle_sessions`, `query_tickets` → `seed.js` with sample users + avatars → `migrate`/`seed` npm scripts ([[Database Schema]])
3. **Task 9** — Express wiring: CORS (localhost:5173), json body, base rate limit, error middleware, **`GET /api/health`**, `server.js` (migrate + listen 3001)

### Day 2–3 (Tue 8 – Wed 9 Jul): first real endpoints
4. **Task 8** — query ticket endpoint (`POST /api/query/submit`): validation + atomic RefNumber + DB write. *Fastest credible "form updates database" demo, no auth needed* ([[UC8 Submit Query Ticket]])
5. **Task 3 subset** — auth: signup (bcrypt, 201) + login (JWT, 200) + auth middleware; email service in console-log dev mode
6. Smoke-test everything in Postman; screenshot/record each call

### Day 3–4 (Wed 9 – Thu 10 Jul): demo evidence + docs freeze
7. Optional stretch: `GET /api/avatar` against seeded data → shows cross-platform sync story ([[UC4 Browse Avatar Archival]])
8. Write 2–3 Supertest cases for ticket + signup (T05 head start — impresses at PM2, required by PM3)
9. Freeze diagrams + change log from the docs track

### Day 5 (Fri 11 – Sat 12 Jul): video
10. Record PM2 video (≤ deadline 12 Jul 23:59): script below
11. Update workload table with commit links

## Demo script (5 min)

1. `npm run dev` → server up on :3001
2. **Ping:** `GET /api/health` in Postman/browser → `{status:"ok", timestamp}` ✅ *"API call with expected output"*
3. **DB write:** submit Contact form (or Postman POST `/api/query/submit`) → 201 `{refNumber: "SPR-20260712-0001"}` → open SQLite (DB Browser / `knex` query) showing the new row ✅ *"submit form to update database"*
4. **Auth:** POST `/signup` → 201 → show `users` row with bcrypt hash (no plaintext!) → POST `/login` → JWT returned; wrong password → 401 same message
5. (If done) `GET /api/avatar` with JWT → seeded records paginated
6. Close on the change log + diagrams

## Fallbacks

- If auth slips: health + ticket demo alone already satisfies the rubric line
- Keep `USE_MOCK_APIS=true` — nothing external during the live checkoff
- All external-API work (Task 6 pipeline) is **PM3 scope**, don't chase it this week

## After PM2 → PM3 runway (video 26 Jul)

Upload pipeline w/ mocks (Task 6) → PVE battle service (Task 7) → frontend pages (Tasks 10–17) → test plan tables + unit/integration implementation (Tasks 18–21) → [[Test Matrix]].

## Post-consultation follow-up

- Update email verification/reset sequence diagrams: system must acknowledge the user directly; do not show Email Server-to-User communication as an in-system interaction.
- Add timeout alternative paths in UC3/reset flows, but do not model Timer/Clock as an external actor.
- Keep DB inside the system boundary; use adapters/interfaces for persistence and external service swapability.
- Decide PM3 sprite cache/reuse policy for same species vs same user-generated variants.

## Related

[[Course Deliverables and Rubrics]] · [[Tech Stack Decision]] · [[API Contract]] · [[Timeline and Milestones]] · [[Checkoff 2 Consultation Minutes]]
