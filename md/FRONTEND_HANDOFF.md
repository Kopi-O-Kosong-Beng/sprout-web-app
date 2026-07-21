# Frontend Handoff

This is the fast-start guide for teammates building the real React UI.

## What Exists Today

The repo already has:

```text
client/  -> React + Vite test app
server/  -> Express + TypeScript backend
Firebase -> Firestore + Firebase Auth
```

The current React app is intentionally a **backend test page**, not the final
product UI. It exists so frontend/design teammates can see the API flows working
before building polished screens.

## First Local Run

From the repo root:

```bash
npm install
cp .env.example server/.env
cp client/.env.example client/.env.local
```

Windows option: copy the files in Explorer and rename the copies manually.

Backend env:

```text
server/.env
FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json
AUTH_DEV_BYPASS=true
EMAIL_MODE=console
```

Put the private backend service account at:

```text
server/serviceAccountKey.json
```

Never commit that file.

Frontend env:

```text
client/.env.local
VITE_API_URL=http://localhost:3001
VITE_FIREBASE_API_KEY=<Firebase web config>
VITE_FIREBASE_AUTH_DOMAIN=<Firebase web config>
VITE_FIREBASE_PROJECT_ID=<Firebase web config>
VITE_FIREBASE_APP_ID=<Firebase web config>
```

The `VITE_FIREBASE_*` values are the Firebase **web app config**, not the
backend service account. They are safe to use in frontend code.

Run:

```bash
npm run dev:server
npm run dev:client
```

Use two terminals.

## Demo Auth User

To test login with real Firebase Auth and still see seeded avatars:

```bash
npm run seed:firestore -w server
npm run seed:firebase-auth-demo -w server
```

Then use:

```text
email: demo@sprout.app
password: Password123!
```

This Firebase Auth user has UID:

```text
demo-user-0001
```

That matches the seeded avatar owner.

## Auth Flow For The Real UI

The real frontend should use Firebase-first auth:

```text
1. User signs up through POST /api/auth/signup.
2. Backend creates Firebase Auth user and sends verification link.
3. User opens verification link from email.
4. Frontend logs in with Firebase JS SDK.
5. Frontend gets Firebase ID token.
6. Frontend sends Authorization: Bearer <idToken> to protected backend routes.
```

Login example:

```ts
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const auth = getAuth(initializeApp(firebaseConfig));
const cred = await signInWithEmailAndPassword(auth, email, password);
const idToken = await cred.user.getIdToken();

api.defaults.headers.common.Authorization = `Bearer ${idToken}`;
```

Protected route example:

```ts
const { data } = await api.get('/api/avatar', {
  headers: { Authorization: `Bearer ${idToken}` },
});
```

## Auth Endpoints

Base URL locally:

```text
http://localhost:3001
```

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/auth/signup` | none | Create Firebase user + backend profile |
| `GET` | `/api/auth/me` | Bearer token | Get current profile |
| `POST` | `/api/auth/request-reset` | none | Send OTP to email/log |
| `POST` | `/api/auth/verify-reset` | none | Verify OTP and update password |
| `GET` | `/api/avatar` | Bearer token | Fetch current user's avatars |
| `POST` | `/api/query/submit` | none | Submit contact/query ticket |

## Password Reset Flow

For local demo, `EMAIL_MODE=console` prints the OTP in the backend terminal.

Frontend flow:

```text
1. User enters email.
2. Call POST /api/auth/request-reset.
3. User enters OTP from email.
4. User enters new password.
5. Call POST /api/auth/verify-reset.
6. User logs in with Firebase using the new password.
```

The backend always returns success from request-reset even if the email is not
registered. That avoids leaking account existence.

## Temporary Dev Bypass

The old avatar test can still use:

```text
x-dev-uid: demo-user-0001
```

That only works when:

```text
AUTH_DEV_BYPASS=true
NODE_ENV is not production
```

The real UI should use Firebase ID tokens instead.

## Common Problems

| Problem | Fix |
|---|---|
| Frontend calls `localhost:3001` in production | Set `VITE_API_URL` in Vercel and redeploy |
| Login button says Firebase config missing | Fill `client/.env.local` with `VITE_FIREBASE_*` values |
| `/api/auth/me` returns `401` | No Firebase ID token was sent |
| `/api/auth/me` returns `403` | User email is not verified yet; open verification link and refresh token |
| Avatar list is empty after login | Use the seeded demo user or create avatars for that Firebase UID |
| Reset OTP not visible | Check backend terminal logs with `EMAIL_MODE=console` |

Related docs:

```text
README.md
DEPLOYMENT.md
server/FIREBASE_SETUP.md
requirements.md
```
