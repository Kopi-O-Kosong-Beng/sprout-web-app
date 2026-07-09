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

## How Vercel and Render Know What to Build

Both platforms are connected to the same GitHub repo, but they use different
instructions.

Vercel reads `vercel.json` and the Vercel project settings:

```json
{
  "installCommand": "npm install",
  "buildCommand": "npm run build -w client",
  "outputDirectory": "client/dist",
  "framework": "vite"
}
```

This means:

```text
Install dependencies from the repo root
Build the client workspace only
Deploy the generated static files from client/dist
```

Render reads `render.yaml`:

```yaml
buildCommand: npm install --include=dev && npm run build -w server
startCommand: npm start -w server
```

This means:

```text
Install dependencies from the repo root
Build the server workspace only
Start the backend using server/package.json
```

Then `server/package.json` runs:

```text
node dist/server.js
```

That starts the Express backend.

The `-w` flag means "workspace":

```text
npm run build -w client  -> run the build script in client/
npm run build -w server  -> run the build script in server/
npm start -w server      -> run the start script in server/
```

So Vercel and Render do not deploy the whole repo in the same way. They both
clone the repo, but each platform follows its own build and start commands.

## How Vercel and Render Talk to Each Other

Vercel and Render do not directly talk to each other during normal app usage.

The real flow is:

```text
User browser
  -> loads frontend files from Vercel
  -> frontend JavaScript calls the Render backend URL
  -> Render backend talks to Firestore
  -> response returns back to the browser
```

In other words, the browser is the thing that connects the frontend and backend.
The frontend makes normal HTTPS API requests to Render.

Current runtime flow:

```text
https://sprout-web-app-jet.vercel.app
  -> calls
https://sprout-backend-gyvk.onrender.com/api/...
  -> reads/writes
Firebase Firestore
```

The frontend knows the backend URL because Vercel has this environment variable:

```text
VITE_API_URL=https://sprout-backend-gyvk.onrender.com
```

The backend allows the frontend to call it because Render has this environment
variable:

```text
CORS_ORIGIN=https://sprout-web-app-jet.vercel.app
```

These two env vars are the main connection between the Vercel frontend and the
Render backend.

## Where the Configuration Lives

Some config is committed in the codebase. Some config lives in the platform
dashboards because it is environment-specific or secret.

| Purpose | Where it lives | Why |
|---|---|---|
| Tell Vercel how to build frontend | `vercel.json` | Safe to commit; same for everyone |
| Tell Render how to build/start backend | `render.yaml` | Safe to commit; same for everyone |
| Frontend backend URL | Vercel env var `VITE_API_URL` | Different per deployment; baked into frontend at build time |
| Backend allowed frontend origin | Render env var `CORS_ORIGIN` | Different per frontend URL |
| Firebase service account | Render env var `FIREBASE_SERVICE_ACCOUNT_JSON` | Secret; never commit |
| Demo auth bypass switch | Render env vars `DEMO_AUTH_BYPASS`, `DEMO_AUTH_BYPASS_USER_ID` | Temporary deployment setting |

Simple rule:

```text
Build instructions go in the repo.
Secrets and deployment-specific URLs go in the platform dashboard.
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
