# Firebase Setup

> **Current status:** Firebase project `sprout-dev-66f08`, Firestore, and Firebase Auth are in use. Firebase Storage is not yet activated; keep `STORAGE_MODE=local` until the storage procedure below is complete and its bucket preflight passes.

> ✅ **Status: DONE.** The Firebase project (`sprout-dev-66f08`) is created, Firestore is connected, and the backend reads/writes it live. This doc is now (a) reference for how it was set up, and (b) the guide for **teammates running the backend locally** and for **the frontend's Firebase config**.

The backend runs on Firebase: **Firestore** (the cross-platform database), **Firebase Auth**, and later **Cloud Storage** for sprites. A **SQLite fallback** (`DATASTORE=sqlite`) also exists so anyone can run offline without the key.

## 🔑 For teammates running the backend locally

You need `serviceAccountKey.json` (Zhi Feng sends it privately — it's a secret, never commit/post it). Put it in `sprout-app/server/`, then in `server/.env` set `DATASTORE=firestore` and `FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json`. Run `npm run dev`. If Firestore is empty, `npm run seed:firestore`. Don't want the key? Use `DATASTORE=sqlite` instead — see the main README.

## ⚠️ Before creating anything: ask Nathaniel

**Does the existing Sprout Android app already have a Firebase project?**
- **Yes** → the web backend should use *that* project (or mirror its Firestore schema) — the shared project literally IS the "cross-platform account database" P0 feature. Get: project access (added as Editor), and the current Firestore collection structure for users/plants.
- **No / it's separate** → create a fresh dev project (steps below) and *we* define the shared schema — mobile adopts it later.

## Production hosting secret

Do **not** commit or upload `serviceAccountKey.json` as a repo file for production. On hosts such as Render, set `FIREBASE_SERVICE_ACCOUNT_JSON` to the full service-account JSON as a secret environment variable, plus:

```
DATASTORE=firestore
NODE_ENV=production
AUTH_DEV_BYPASS=false
DEMO_AUTH_BYPASS=false
DEMO_AUTH_BYPASS_USER_ID=demo-user-0001
CORS_ORIGIN=https://your-vercel-frontend.vercel.app
FRONTEND_URL=https://your-vercel-frontend.vercel.app
```

`FIREBASE_SERVICE_ACCOUNT_BASE64` is also supported if the host handles multiline JSON poorly: base64-encode the JSON file contents and set that env var instead.

## Production auth and email checklist

1. In Firebase Console for `sprout-dev-66f08`, open **Authentication -> Settings -> Authorized domains** and add the deployed Vercel domain.
2. In Render, set `FRONTEND_URL` to that HTTPS Vercel origin. This makes verification action links use `https://<vercel-domain>/verify-email?...`.
3. On `hello.sprout.team@gmail.com`, enable Google **2-Step Verification**, then open **Google Account -> Security -> App passwords** and create an app password named `Sprout Backend`.
4. Put the 16-character app password only in local `server/.env` as `SMTP_PASS` and in Render's secret environment dashboard. Do not put it in this repository, screenshots, or chat.
5. After the secret is configured, run `npm.cmd run check:email -w server`. The expected live result is `[email-check] mode=smtp verified=true`.
6. Submit one signup, one reset request, and one Contact Us ticket with controlled addresses. Confirm the inboxes, redact OTP/action codes and private addresses in any evidence, and confirm the verification link completes `applyActionCode`.

Firebase Auth remains the identity authority: the frontend obtains Firebase ID tokens and the backend verifies `Authorization: Bearer <idToken>`. Do not add a custom JWT or signup-OTP flow.

## Firebase Storage activation (pending teammate)

1. In Firebase project `sprout-dev-66f08`, link the **Blaze** billing plan.
2. Create budget alerts; alerts notify but are not spending caps.
3. Create Cloud Storage deliberately in the Firestore/backend region where Firebase allows it.
4. Publish restrictive Storage rules before allowing client access.
5. Set `FIREBASE_STORAGE_BUCKET` to the created bucket name in local `server/.env` and Render's secret environment dashboard.
6. Run `npm.cmd run check:storage -w server`. It writes, reads, and deletes one uniquely named tiny object under `.preflight/`; success prints `[storage-check] bucket=<name> writeReadDelete=true`.
7. Keep `STORAGE_MODE=local` until that command passes. Only then switch the deployed environment to the storage mode required by the backend.

This preflight uses the Firebase Admin SDK, so it verifies backend credentials and bucket access. Admin SDK requests bypass client Security Rules; passing this command does **not** test or validate the published restrictive Storage rules.

## Steps (fresh project path)

1. Go to https://console.firebase.google.com → **Add project** → name it `sprout-dev` → Google Analytics off (not needed)
2. **Build → Firestore Database → Create database** → Start in **production mode** (deny-all — correct, since only our backend touches it) → location **asia-southeast1 (Singapore)**
3. **Build → Authentication → Get started** → enable **Email/Password**. Google sign-in can be enabled later when the real UI supports it.
4. **Project settings (gear) → Service accounts → Generate new private key** → save the downloaded file as:
   ```
   sprout-app/server/serviceAccountKey.json
   ```
   (already gitignored — NEVER commit it, never share it in the group chat; send to teammates privately if they run the backend locally)
5. In `sprout-app/server/.env`, flip these two lines:
   ```
   DATASTORE=firestore
   FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json
   ```
6. Restart the server (`npm run dev`) → `POST /api/query/submit` now writes to Firestore. Check it in the console: **Firestore Database → query_tickets** collection.

## For the frontend teammate

They need the **web app config** (not the service account!):
- Project settings → **Your apps → Add app → Web (</>)** → register `sprout-web`
- Copy the `firebaseConfig` object (apiKey, authDomain, projectId, …) — this is safe to put in frontend code
- Put those values in `client/.env.local` as `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_APP_ID`
- Frontend signs in with the Firebase JS SDK, then calls our API:
  ```ts
  import { initializeApp } from 'firebase/app';
  import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

  const auth = getAuth(initializeApp(firebaseConfig));
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const idToken = await cred.user.getIdToken();
  // send on every API call:
  axios.get('http://localhost:3001/api/avatar', {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  ```

For the built-in auth demo user, run:

```bash
npm run seed:firebase-auth-demo -w server
```

Then log in from the React test page with:

```text
demo@sprout.app / Password123!
```

## Security rules (paste in Firestore → Rules)

All reads/writes go through the Express backend (Admin SDK bypasses rules) — clients get nothing directly, exactly matching the prof's "cross-platform backend API call, not database" feedback:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

## Firestore collections (defined by the backend repos)

| Collection | Purpose | Written by |
|---|---|---|
| `query_tickets` | Contact Us tickets | `ticket.repo.firestore.ts` ✅ built |
| `counters` | Atomic daily ticket sequence | `ticket.repo.firestore.ts` ✅ built |
| `avatar_records` | Plant avatars (mobile + web, isTemporary flag) | `avatar.repo.firestore.ts` ✅ built (read) |
| `users` | Profile docs keyed by Firebase Auth uid, plus reset OTP hash/TTL fields | seeded ✅; auth flow built |
| `password_history` | Last-3 reset password hashes per user | auth flow built |
| `battle_sessions` | PVE battle state | battle repo (later) |

Security rules to publish: see [`../firestore.rules`](../firestore.rules) (deny-all — backend-only access).
