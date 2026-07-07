/** Firebase Admin SDK init — lazy, so SQLite-mode runs never require a key.
 *  Final architecture per Master.docx: Firestore (cross-platform DB shared with
 *  the mobile app), Firebase Auth (ID-token verification), Cloud Storage (PM3).
 *
 *  Uses the modular Admin API (firebase-admin v12+).
 *  Setup: see FIREBASE_SETUP.md. Key file is gitignored — never commit it.
 */
import path from 'path';
import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';

let app: App | undefined;

function getApp(): App {
  if (!app) {
    const existing = getApps();
    if (existing.length > 0) {
      app = existing[0];
    } else {
      const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
      app = keyPath
        ? initializeApp({ credential: cert(path.resolve(__dirname, keyPath)) })
        : // Falls back to GOOGLE_APPLICATION_CREDENTIALS / emulator env
          // (FIRESTORE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST)
          initializeApp();
    }
  }
  return app;
}

export function getDb(): Firestore {
  return getFirestore(getApp());
}

export function getAuthAdmin(): Auth {
  return getAuth(getApp());
}
