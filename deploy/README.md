# Deployment env files

`deploy/*.env` files hold ready-to-import environment values for the hosting
dashboards. They contain real secrets, are **gitignored, and must never be
committed** — only this README is tracked.

| File | Where to import | Notes |
|---|---|---|
| `vercel.env` | Vercel → Project Settings → Environment Variables → Import `.env` (apply to Production and Preview) | Frontend `VITE_*` config: API URL + Firebase web app keys (safe for browsers, still keep the file private) |
| `render.env` | Render → sprout-backend → Environment → Edit → Add from `.env` | Only the `sync: false` secrets. Everything else is pinned by `render.yaml` (blueprint-managed) and applies automatically when the blueprint branch updates |

Regenerate values from the local sources of truth: `client/.env.local` and
`server/.env`. If a file is missing, ask whoever holds the local env files —
do not reconstruct secrets from chat logs or screenshots.

Render checklist when merging a branch that changes `render.yaml`:

1. Confirm `SMTP_PASS` exists in the dashboard **before** the merge flips
   `EMAIL_MODE=smtp` (a missing SMTP variable makes email sends throw).
2. Set `CORS_ORIGIN` and `FRONTEND_URL` to the Vercel production URL.
3. Remove variables no code reads anymore (e.g. `DATASTORE` after the
   Firestore-only cutover).
