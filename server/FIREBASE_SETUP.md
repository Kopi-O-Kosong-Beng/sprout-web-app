# Firebase Setup

> ✅ **Status: DONE.** The Firebase project (`sprout-dev-66f08`) is created, Firestore is connected, and the backend reads/writes it live. This doc is now (a) reference for how it was set up, and (b) the guide for **teammates running the backend locally** and for **the frontend's Firebase config**.

The backend runs on Firebase: **Firestore** (the cross-platform database), **Firebase Auth**, and later **Cloud Storage** for sprites. A **SQLite fallback** (`DATASTORE=sqlite`) also exists so anyone can run offline without the key.

## 🔑 For teammates running the backend locally

You need `serviceAccountKey.json` (Zhi Feng sends it privately — it's a secret, never commit/post it). Put it in `sprout-app/server/`, then in `server/.env` set `DATASTORE=firestore` and `FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json`. Run `npm run dev`. If Firestore is empty, `npm run seed:firestore`. Don't want the key? Use `DATASTORE=sqlite` instead — see the main README.

## ⚠️ Before creating anything: ask Nathaniel

**Does the existing Sprout Android app already have a Firebase project?**
- **Yes** → the web backend should use *that* project (or mirror its Firestore schema) — the shared project literally IS the "cross-platform account database" P0 feature. Get: project access (added as Editor), and the current Firestore collection structure for users/plants.
- **No / it's separate** → create a fresh dev project (steps below) and *we* define the shared schema — mobile adopts it later.

## Steps (fresh project path)

1. Go to https://console.firebase.google.com → **Add project** → name it `sprout-dev` → Google Analytics off (not needed)
2. **Build → Firestore Database → Create database** → Start in **production mode** (deny-all — correct, since only our backend touches it) → location **asia-southeast1 (Singapore)**
3. **Build → Authentication → Get started** → enable **Email/Password** and **Google** sign-in providers
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
| `users` | Profile docs keyed by Firebase Auth uid | seeded ✅; write path with auth flow (next) |
| `password_resets` | OTP hashes + TTL for UC3 custom reset | auth flow (next) |
| `password_history` | Last-3 reset password hashes per user | auth flow (next) |
| `battle_sessions` | PVE battle state | battle repo (later) |

Security rules to publish: see [`../firestore.rules`](../firestore.rules) (deny-all — backend-only access).
