# Sprout Deployment Guide

This guide explains how our web app is deployed and what teammates should check
when something breaks.

## One-Minute Summary

We use one GitHub repo:

```text
Kopi-O-Kosong-Beng/sprout-web-app
```

The repo is a monorepo:

```text
client/  -> React + Vite frontend
server/  -> Node.js + Express backend
Firebase -> Firestore + Firebase Auth
```

Production deployment:

| Part | Platform | URL |
|---|---|---|
| Frontend | Vercel | `https://sprout-web-app-jet.vercel.app` |
| Backend | Render | `https://sprout-backend-gyvk.onrender.com` |
| Database/Auth | Firebase | Firestore + Firebase Auth |

The simplest mental model:

```text
Vercel hosts the website.
Render hosts the API.
Firebase stores the data and verifies users.
```

## What Each Platform Builds

Vercel and Render are connected to the same GitHub repo, but they follow
different instructions.

```text
GitHub repo
  -> Vercel reads vercel.json
       -> builds client/
       -> deploys client/dist

  -> Render reads render.yaml
       -> builds server/
       -> runs the Express backend
```

### Vercel Builds the Frontend

Vercel uses `vercel.json`:

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
Install dependencies from the repo root.
Build only the client workspace.
Deploy the generated static files from client/dist.
```

The `-w client` part means "run this npm script inside `client/`".

### Render Builds the Backend

Render uses `render.yaml`:

```yaml
buildCommand: npm install --include=dev && npm run build -w server
startCommand: npm start -w server
```

This means:

```text
Install dependencies from the repo root.
Build only the server workspace.
Start the backend using server/package.json.
```

Then `server/package.json` runs:

```text
node dist/server.js
```

That starts the Express API server.

The `-w server` part means "run this npm script inside `server/`".

## How Frontend and Backend Connect

Vercel and Render do not directly talk to each other during normal app usage.

The user's browser connects them:

```text
User browser
  -> loads frontend files from Vercel
  -> frontend JavaScript calls the Render backend URL
  -> Render backend talks to Firestore
  -> response returns to the browser
```

Current runtime flow:

```text
https://sprout-web-app-jet.vercel.app
  -> calls
https://sprout-backend-gyvk.onrender.com/api/...
  -> reads/writes
Firebase Firestore
```

Two environment variables make this work:

```text
Vercel: VITE_API_URL=https://sprout-backend-gyvk.onrender.com
Render: CORS_ORIGIN=https://sprout-web-app-jet.vercel.app
```

`VITE_API_URL` tells the frontend where the backend is.

`CORS_ORIGIN` tells the backend which frontend is allowed to call it from a
browser.

## Where Configuration Lives

Some settings are safe to commit. Others must stay in the platform dashboard.

| Purpose | Location | Why |
|---|---|---|
| Tell Vercel how to build frontend | `vercel.json` | Safe repo config |
| Tell Render how to build/start backend | `render.yaml` | Safe repo config |
| Frontend backend URL | Vercel env var `VITE_API_URL` | Depends on deployed backend URL |
| Backend allowed frontend origin | Render env var `CORS_ORIGIN` | Depends on deployed frontend URL |
| Firebase service account | Render env var `FIREBASE_SERVICE_ACCOUNT_JSON` | Secret; never commit |
| Demo auth bypass | Render env vars `DEMO_AUTH_BYPASS`, `DEMO_AUTH_BYPASS_USER_ID` | Temporary demo-only setting |

Simple rule:

```text
Build instructions go in the repo.
Secrets and deployment-specific URLs go in the platform dashboard.
```

## Why Vercel + Render?

Vercel is a good fit for the frontend because React + Vite builds into static
files:

```text
HTML + CSS + JavaScript
```

Render is a good fit for the backend because our current backend is a normal
Express server:

```text
npm start -w server
```

That starts a long-running Node process and listens for API requests.

The product itself does not strictly require an always-running Express process.
The same product could be refactored into serverless functions later. But right
now, Render matches the backend we already built, so deployment is simpler and
less risky.

## Why Not Deploy Everything on Vercel?

Vercel can run backend code, but its backend model is usually serverless
functions.

Serverless functions are short-lived. There is usually no always-running Express
process. Each API request may start a function, handle the request, then stop.

That can work, but our current backend would need extra work:

- adapt Express routing to Vercel serverless
- make sure production bundles Firestore only
- avoid SQLite/native dependency issues from `better-sqlite3`
- retest Firebase Admin initialization and cold starts

So the decision is:

```text
Vercel for frontend because it is static after build.
Render for backend because our current API is a normal Express server.
```

## Vercel Settings

Project:

```text
sprout-web-app
```

Build settings:

```text
Install Command: npm install
Build Command: npm run build -w client
Output Directory: client/dist
Framework: Vite
```

Environment variable:

```text
VITE_API_URL=https://sprout-backend-gyvk.onrender.com
```

Important: Vite only exposes frontend env vars that start with `VITE_`. That is
why the name is `VITE_API_URL`, not just `API_URL`.

After changing `VITE_API_URL`, redeploy Vercel. Vite bakes env vars into the
frontend during build.

## Render Settings

Service:

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
account JSON into Render as `FIREBASE_SERVICE_ACCOUNT_JSON`.

## Temporary Demo Auth Bypass

Real Firebase login is not wired into the frontend yet.

For demo purposes only, Render currently allows the seeded demo user:

```text
DEMO_AUTH_BYPASS=true
DEMO_AUTH_BYPASS_USER_ID=demo-user-0001
```

Then protected avatar requests can use:

```text
x-dev-uid: demo-user-0001
```

When Firebase login is implemented, turn the bypass off in Render:

```text
DEMO_AUTH_BYPASS=false
```

Then redeploy Render.

## CORS

Render should use this exact value:

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

## Deployment Checklist

Use this checklist after changing deployment settings.

1. Push latest code to `main`.
2. Confirm Render deployed the latest commit.
3. Confirm Render env vars are correct.
4. Confirm Vercel has `VITE_API_URL`.
5. Redeploy Vercel after changing `VITE_API_URL`.
6. Redeploy Render after changing Render env vars.
7. Run the smoke tests below.

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

| Problem | Most likely cause | Fix |
|---|---|---|
| Frontend still calls `http://localhost:3001` | `VITE_API_URL` was missing during Vercel build | Set `VITE_API_URL` in Vercel and redeploy |
| Browser shows CORS error | Render `CORS_ORIGIN` is wrong | Set it to `https://sprout-web-app-jet.vercel.app` without trailing slash |
| `/api/avatar` returns `401` during demo | Demo bypass is off or Render did not redeploy | Set `DEMO_AUTH_BYPASS=true`, then redeploy Render |
| `/api/health` works but Firestore routes fail | Firebase secret issue | Check `FIREBASE_SERVICE_ACCOUNT_JSON` in Render |
| Render service sleeps | Free Render plan cold start | Open `/api/health` a minute before demo |

## What To Tell Teammates

Short explanation:

```text
We use one repo. Vercel builds client/ and hosts the frontend. Render builds
server/ and runs the Express API. The browser loads the frontend from Vercel,
then the frontend calls the Render API using VITE_API_URL. Render allows that
frontend through CORS_ORIGIN and stores data in Firebase Firestore.
```
