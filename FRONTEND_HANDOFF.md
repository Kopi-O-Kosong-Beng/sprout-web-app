# 🤝 Frontend Handoff — start here

**Backend + database are set up and working.** This doc is everything you need to build the frontend without waiting on Zhi Feng. Read it once, top to bottom.

---

## TL;DR

- Backend runs on **`http://localhost:3001`**, database is **Cloud Firestore** (already connected, already has demo data)
- You build the React app in **`client/`** (see [Getting the frontend started](#getting-the-frontend-started))
- Call the API with **axios**; for now you can act as the demo user with **one header** — no login needed yet
- Live endpoints today: **health**, **submit query ticket**, **list/get avatars**. More land over time; the contract for all of them is in `requirements.md`.

---

## 1. Run the backend (once, ~3 min)

You need the Firebase key from Zhi Feng (a file called `serviceAccountKey.json`). **He sends it to you privately — it's a secret, never put it in Git or the group chat.** Put it in `sprout-app/server/`.

```bash
git clone https://github.com/Kopi-O-Kosong-Beng/sprout-web-app.git
cd sprout-web-app
npm install
cp .env.example server/.env          # Windows: copy the file in Explorer, rename to .env
# put serviceAccountKey.json into server/
# open server/.env and set:  DATASTORE=firestore
npm run dev
```

You should see `Sprout backend listening on http://localhost:3001 (datastore: firestore)`.
Check it: open http://localhost:3001/api/health → `{"status":"ok",...}`.

> **Don't have the key yet / want to work offline?** Set `DATASTORE=sqlite` in `server/.env`, then `npm run migrate && npm run seed`. Everything below works identically against a local file — no Firebase needed. Switch back to `firestore` anytime.

## 2. See what's in the database

```bash
npm run inspect      # prints users, avatars, tickets from whichever datastore is active
```

Or open the **Firebase console → Firestore Database** to click through `users`, `avatar_records`, `query_tickets` visually.

Demo data already seeded: **1 user** (`demo@sprout.app`, id `demo-user-0001`) with **5 avatars**.

## 3. Calling the API from React

### Auth right now: the dev shortcut

Full login is Firebase Auth (below), but it's not wired yet. So the backend has a **dev-only shortcut**: send the header `x-dev-uid: demo-user-0001` and the backend treats you as the demo user. This lets you build and test the avatar archive page **today**, before any login screen exists.

```ts
// client/src/services/apiClient.ts
import axios from 'axios';

export const api = axios.create({ baseURL: 'http://localhost:3001' });

// TEMPORARY dev auth — remove once Firebase login is wired (see §4)
api.defaults.headers.common['x-dev-uid'] = 'demo-user-0001';
```

```ts
// example: fetch the avatar archive
const { data } = await api.get('/api/avatar');       // { items, page, pageSize, total }
data.items.forEach(a => console.log(a.speciesName, a.stats.hp));
```

> The dev shortcut only works while `AUTH_DEV_BYPASS=true` in `server/.env` and never in production. It's just scaffolding so you're not blocked.

### Auth later: real Firebase login (§4)

When we wire real auth, you swap the dev header for a real Firebase ID token — see [§4](#4-real-auth-when-were-ready).

## 4. Endpoints available now

Base URL `http://localhost:3001`. Full contracts (exact error strings, limits) are in `requirements.md`.

| Method | Endpoint | Auth | Request | Response |
|---|---|---|---|---|
| GET | `/api/health` | none | — | `{ status, timestamp }` |
| POST | `/api/query/submit` | none | `{ name, email, category, message }` | `201 { refNumber }` |
| GET | `/api/avatar` | yes | `?page=1&pageSize=20` | `{ items: Avatar[], page, pageSize, total }` |
| GET | `/api/avatar/:id` | yes | — | `Avatar` or `404` |

**`category`** must be one of: `general`, `bug`, `billing`, `partnership`, `other`.
**`message`** max 2000 chars. Invalid input → `400 { error: "..." }`.

**Avatar shape:**
```ts
interface Avatar {
  id: string;
  userId: string;
  speciesName: string;
  speciesFamily: string | null;
  spriteUrl: string;              // e.g. "/static/sprites/quercus-robur.png"
  discoveredAt: string;           // ISO date
  source: 'mobile' | 'web';       // 'web' uploads are temporary
  isTemporary: boolean;
  expiresAt: string | null;
  stats: { hp: number; attack: number; defense: number; speed: number };
  metadata: Record<string, unknown> | null;
}
```

> `spriteUrl` points at placeholder paths for now (real sprite images come with the upload pipeline later). Use a placeholder image in the UI if the file 404s.

### Coming soon (contracts already written in `requirements.md`, code lands over the sprints)

`POST /api/auth/*` (signup/login/reset) · `POST /api/upload/plant` (GenAI sprite) · `POST /api/battle/pve/*`. Build the pages against the documented contracts; when the endpoint lands it'll match.

## 5. Real auth (when we're ready)

The frontend owns login via the **Firebase JS SDK** (Zhi Feng will share the web config — the safe-to-commit `firebaseConfig`, different from the secret key):

```ts
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const auth = getAuth(initializeApp(firebaseConfig));
const cred = await signInWithEmailAndPassword(auth, email, password);
const idToken = await cred.user.getIdToken();

// then send it instead of the dev header:
api.defaults.headers.common['Authorization'] = `Bearer ${idToken}`;
```

The backend verifies that token and knows who you are. Google sign-in (`signInWithPopup`) works the same way.

## 6. Getting the frontend started

The `client/` app isn't scaffolded yet (it's Task 10 in `tasks.md`). When you start:

```bash
cd sprout-app
npm create vite@latest client -- --template react-ts
cd client && npm install react-router-dom axios @tanstack/react-query
```

Suggested first page to build: the **Contact Us form** (maps to `POST /api/query/submit`, no auth) or the **Avatar Archive** (maps to `GET /api/avatar`, use the dev header). Both have working backends right now.

Design system (colors, fonts, mockups) is in the knowledge base repo → `03 Design/UI Design System`.

## 7. If something breaks

| Problem | Fix |
|---|---|
| `http://localhost:3001/api/health` doesn't load | backend isn't running — `npm run dev` in the repo root |
| Avatar calls return `401` | you didn't send `x-dev-uid` (or `AUTH_DEV_BYPASS` isn't `true` in `server/.env`) |
| `Failed to fetch` in browser, works in Postman | CORS — serve your app from `http://localhost:5173` (Vite default) |
| Backend won't start, mentions Firebase/credential | `serviceAccountKey.json` missing or `DATASTORE=firestore` without the key — either add the key or use `DATASTORE=sqlite` |
| Want to reset demo data | `npm run seed:firestore` (or `npm run seed` for sqlite) |

Still stuck after this doc? Screenshot the **full** terminal/console error into the chat. This doc + `requirements.md` should answer almost everything.

---

**Related:** `SPECS.md` (how the specs work) · `requirements.md` (exact API contracts) · `README.md` (full setup) · `server/FIREBASE_SETUP.md` (Firebase details)
