# Sprout — Command Reference

Every command in this repo, in the order you'd meet them. Run from the **repo
root** unless a line says otherwise; `-w server` / `-w client` targets a
workspace without changing directory.

> `--` matters. `npm run x -w server -- --flag` passes `--flag` to the script.
> Without it npm eats the flag.

---

## 1. Prerequisites

```bash
node --version          # need Node 22 LTS
npm --version
java -version           # need 11+ — ONLY for the emulator test suite (§5)
```

---

## 2. First-time setup

```bash
git clone https://github.com/Kopi-O-Kosong-Beng/sprout-web-app.git
cd sprout-web-app
npm install                              # installs root + both workspaces
```

Create the two env files (neither is committed):

```bash
cp .env.example server/.env              # backend: Firebase creds, email, API keys
cp client/.env.example client/.env.local # frontend: VITE_API_URL + Firebase web config
```

Minimum to boot: `FIREBASE_SERVICE_ACCOUNT_PATH` (or `..._JSON` / `..._BASE64`)
and `FIREBASE_STORAGE_BUCKET` in `server/.env`; the `VITE_FIREBASE_*` values in
`client/.env.local`. Every external API key is optional — the pipeline degrades
hop by hop and still returns a placeholder sprite.

---

## 3. Daily development

```bash
npm run dev:server      # backend on :3001, tsx watch, no build step
npm run dev:client      # frontend on :5173, Vite HMR
npm run dev             # alias for dev:server
```

Run the two in separate terminals — there is no combined script.

```bash
PORT=3002 npm run dev                    # if :3001 is taken (bash)
$env:PORT=3002; npm run dev              # same, PowerShell
```

---

## 4. Seeding and demo data

```bash
npm run seed                             # alias for seed:firestore
npm run seed:firestore -w server         # avatars, dex, sample tickets
npm run seed:firebase-auth-demo -w server # login for the seeded avatar owner
```

Demo login: `demo@sprout.app` / `Password123!` (uid `demo-user-0001`).

```bash
# Render missing plant art (needs FLUX_API_KEY or another image key)
npm run sprites:generate -w server
npm run sprites:generate -w server -- --force            # re-render everything
npm run sprites:generate -w server -- --only=thornback   # just one
```

---

## 5. Superadmin and access control

Grants are resolved server-side as **Firestore flag OR `ADMIN_EMAILS`**. Both
fail closed. Identity is always the **email address** — display name is never a
lookup key.

### Create an admin account and grant it

```bash
# email, password, [displayName], --superadmin (flag position is free)
npm run seed:admin -w server -- sprout@gmail.com 'Passw0rd!' --superadmin
npm run seed:admin -w server -- sprout@gmail.com 'Passw0rd!' 'Sprout Admin' --superadmin

# No flag = creates the account but grants nothing; the script says so.
npm run seed:admin -w server -- sprout@gmail.com 'Passw0rd!'
```

Password must pass the signup rule: 8+ chars with upper, lower, digit, symbol.
The account is created email-verified, so no link has to be fished out of a
shared inbox.

> **Re-running this on an existing account resets that account's password.**
> Never use it to promote a teammate whose password you don't own — use the
> dashboard below.

Credentials can live in `server/.env` instead of shell history:

```bash
SEED_ADMIN_EMAIL=sprout@gmail.com
SEED_ADMIN_PASSWORD=Passw0rd!
SEED_ADMIN_DISPLAY_NAME=Sprout Admin
SEED_ADMIN_SUPERADMIN=true
```

### Promote or revoke an existing user

No CLI for this by design — it writes only the flag, touching nothing else:

**Admin → Accounts → "Make superadmin" / "Revoke superadmin"**

Refused on your own row (no one-click self-lockout) and on allowlisted
addresses (clearing the flag wouldn't remove their access).

### Break-glass allowlist

```bash
# server/.env — comma-separated, case-insensitive. Restart the server after.
ADMIN_EMAILS=hello.sprout.team@gmail.com,teammate@gmail.com
```

Deploy config, so it survives anything done to the database — this is how you
get back in if the `users` collection is wiped or a bad flag write locks
everyone out. Empty or unset grants nobody.

### What the grant unlocks

Studio, API Test, Ticket Manager, Admin. Everything else is public
(Home, Ranking, Contact) or player-level (Scan, Archive, PVE Battle).

---

## 6. Tests

```bash
npm test                        # server then client — the full gate
npm run test:server
npm run test:client
```

Per suite:

```bash
npm test -w client                        # vitest, 17 files
npm run test:pipeline -w server           # vitest, pipeline units — no emulator
npm run test:jest:emulator -w server      # jest + Firestore emulator (needs Java 11+)
npm run test:jest -w server               # jest against an emulator you started yourself
```

Types and lint:

```bash
npm run typecheck -w server               # tsc --noEmit
npx tsc -b --pretty false -w client       # client has no typecheck script; build does it
npm run lint -w client                    # oxlint
```

### Two environment gotchas

**Windows: vitest's default fork pool times out.** Workers fail to start and
the run dies with `Timeout waiting for worker to respond`. Use threads:

```bash
npx vitest run --pool=threads --no-file-parallelism    # in client/ or server/
```

**The emulator suite needs Java 11+.** With Java 8 the emulator exits code 1
immediately and no test runs. Check with `java -version`. This suite covers the
auth and admin API routes, so it's the one to get running before a demo.

---

## 7. Build and deploy

```bash
npm run build -w server         # clean + tsc -> server/dist
npm run start -w server         # run the built output (node dist/server.js)
npm run start:ts -w server      # run from source, no build

npm run build -w client         # tsc -b + vite build -> client/dist
npm run preview -w client       # serve the built frontend locally
npm run clean -w server         # wipe server/dist
```

Frontend deploys to Vercel (`vercel.json`), backend to Render
(`render.yaml`). Set `VITE_API_URL` as a Vercel project env var, not in
`.env.local`.

---

## 8. Diagnostics

```bash
npm run inspect:firestore -w server    # dump collections and counts
npm run check:email -w server          # verify EMAIL_MODE transport actually sends
npm run check:storage -w server        # verify FIREBASE_STORAGE_BUCKET is reachable
```

Smoke tests against a running backend:

```bash
curl http://localhost:3001/api/health

# Public ticket submit — returns a SPR-YYYYMMDD-NNNN reference
curl -X POST http://localhost:3001/api/query/submit \
  -H "Content-Type: application/json" \
  -d '{"name":"Smoke","email":"local@example.com","subject":"Test","category":"general","message":"Local setup test"}'

# Public ticket status — needs BOTH the reference and the filing email
curl -X POST http://localhost:3001/api/query/status \
  -H "Content-Type: application/json" \
  -d '{"refNumber":"SPR-20260712-0001","email":"local@example.com"}'

# Protected route while AUTH_DEV_BYPASS=true (dev only, never production)
curl http://localhost:3001/api/avatar -H "x-dev-uid: demo-user-0001"
```

---

## 9. Quick reference

| Task | Command |
| --- | --- |
| Install everything | `npm install` |
| Start backend | `npm run dev:server` |
| Start frontend | `npm run dev:client` |
| Seed database | `npm run seed` |
| Create + grant admin | `npm run seed:admin -w server -- <email> '<pw>' --superadmin` |
| Promote existing user | Admin → Accounts → Make superadmin |
| Break-glass grant | `ADMIN_EMAILS=` in `server/.env`, restart |
| Full test gate | `npm test` |
| Client tests (Windows) | `cd client && npx vitest run --pool=threads --no-file-parallelism` |
| Typecheck backend | `npm run typecheck -w server` |
| Inspect the database | `npm run inspect:firestore -w server` |
