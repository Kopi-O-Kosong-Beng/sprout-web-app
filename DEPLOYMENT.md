# Sprout Deployment Guide

This file explains how the web app is deployed, why we use two platforms, and
what to check when something breaks.

## Short Version

We keep one GitHub repo:

```text
Kopi-O-Kosong-Beng/sprout-web-app
```

Deployment:

```text
client/  -> Vercel
server/  -> Render
Firebase -> Firestore + Firebase Auth
```

Current production URLs:

```text
Frontend: https://sprout-web-app-jet.vercel.app
Backend:  https://sprout-backend-gyvk.onrender.com
```

## Why Vercel for Frontend?

The frontend is a React + Vite app.

Vercel is a good fit because the frontend builds into static files:

```text
HTML + CSS + JavaScript
```

Vercel can host those files very easily, gives us HTTPS automatically, connects
to GitHub, and redeploys whenever `main` changes.

Vercel frontend env var:

```text
VITE_API_URL=https://sprout-backend-gyvk.onrender.com
```

Important: Vite only exposes browser env vars that start with `VITE_`. That is
why the variable is called `VITE_API_URL`, not just `API_URL`.

After changing `VITE_API_URL`, redeploy Vercel. Vite bakes env vars into the
frontend at build time.

## Why Render for Backend?

The backend is a Node.js + Express server.

It is designed to run like a normal long-running server:

```text
npm start -w server
```

That command starts Express, listens on a port, keeps Firebase Admin initialized,
and serves requests until the process stops.

Render is a good fit because it runs the backend as a persistent web service.
It supports:

- a long-running Node process
- health checks at `/api/health`
- production environment variables
- secrets such as the Firebase service account JSON
- normal Express routing without changing the app structure

## Why Not Put Everything on Vercel?

Vercel is excellent for frontend hosting. It can also run backend code, but its
backend model is usually serverless functions.

Serverless means:

- there is no always-running Express process
- each API call may start a short-lived function
- cold starts can happen after inactivity
- local files are temporary
- native packages can be harder to deploy
- the backend often needs a Vercel-specific adapter or folder structure

Our backend was already built as a normal Express app. It also includes a local
SQLite fallback using `better-sqlite3`, which is a native dependency and is not
a good fit for standard serverless deployment. Production uses Firestore, but
keeping the backend on Render avoids fighting with serverless packaging and
runtime differences.

So the decision is not "Vercel cannot ever do backend". The decision is:

```text
For our current backend shape, Render is simpler and safer.
```

If we wanted to deploy the backend on Vercel later, we would need to refactor or
adapt the server for serverless and make sure production only uses Firestore.

## Required Render Env Vars

Render service:

```text
sprout-backend
```

Important env vars:

```text
NODE_ENV=production
DATASTORE=firestore
AUTH_DEV_BYPASS=false
EMAIL_MODE=console
USE_MOCK_APIS=true
MIN_CONFIDENCE_THRESHOLD=0.70
FIREBASE_SERVICE_ACCOUNT_JSON=<full Firebase service account JSON>
ADMIN_EMAIL=<team admin email>
CORS_ORIGIN=https://sprout-web-app-jet.vercel.app
```

Do not commit `server/serviceAccountKey.json`. For production, paste the service
account JSON into Render as an environment variable.

## Temporary Demo Auth Bypass

Real Firebase login is not wired into the frontend yet.

For demo purposes only, Render can temporarily allow the seeded demo user:

```text
DEMO_AUTH_BYPASS=true
DEMO_AUTH_BYPASS_USER_ID=demo-user-0001
```

Then protected avatar requests can use:

```text
x-dev-uid: demo-user-0001
```

When Firebase login is implemented, turn the bypass off:

```text
DEMO_AUTH_BYPASS=false
```

Keep this setting off for real production usage.

## CORS

The backend only allows the real Vercel frontend origin.

Render should use:

```text
CORS_ORIGIN=https://sprout-web-app-jet.vercel.app
```

No trailing slash.

Correct:

```text
https://sprout-web-app-jet.vercel.app
```

Wrong:

```text
https://sprout-web-app-jet.vercel.app/
```

## Smoke Tests

Backend health:

```bash
curl https://sprout-backend-gyvk.onrender.com/api/health
```

Expected:

```json
{ "status": "ok", "timestamp": "..." }
```

Submit query:

```bash
curl -X POST https://sprout-backend-gyvk.onrender.com/api/query/submit \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Deploy Smoke\",\"email\":\"deploy@example.com\",\"category\":\"general\",\"message\":\"Deployment smoke test\"}"
```

Expected:

```json
{ "refNumber": "SPR-YYYYMMDD-NNNN" }
```

Avatar demo bypass:

```bash
curl -H "x-dev-uid: demo-user-0001" \
  "https://sprout-backend-gyvk.onrender.com/api/avatar?page=1&pageSize=20"
```

Expected while `DEMO_AUTH_BYPASS=true`:

```text
200 OK
```

Expected after real Firebase login is enforced:

```text
401 Unauthorized unless Authorization: Bearer <Firebase ID token> is sent
```

## Common Issues

If the frontend still calls `http://localhost:3001`, then `VITE_API_URL` was not
available during the Vercel build. Set it in Vercel and redeploy.

If `/api/avatar` returns `401`, check Render:

```text
DEMO_AUTH_BYPASS=true
DEMO_AUTH_BYPASS_USER_ID=demo-user-0001
```

Then redeploy Render.

If the browser shows a CORS error, check Render:

```text
CORS_ORIGIN=https://sprout-web-app-jet.vercel.app
```

If `/api/health` works but Firestore features fail, check that
`FIREBASE_SERVICE_ACCOUNT_JSON` is correctly set in Render.
