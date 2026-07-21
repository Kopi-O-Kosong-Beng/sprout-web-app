/** Firebase Admin SDK initialization for Firestore, Auth, and Storage.
 *  Final architecture per Master.docx: Firestore (cross-platform DB shared with
 *  the mobile app), Firebase Auth (ID-token verification), Cloud Storage (PM3).
 *
 *  Uses the modular Admin API (firebase-admin v12+).
 *  Setup: see FIREBASE_SETUP.md. Key file is gitignored — never commit it.
 */
import fs from 'fs';
import path from 'path';
import {
  initializeApp,
  cert,
  getApps,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getStorage, type Storage } from 'firebase-admin/storage';

let app: App | undefined;

function parseServiceAccount(raw: string): ServiceAccount {
  const account = JSON.parse(raw) as ServiceAccount & { private_key?: string };
  if (typeof account.privateKey === 'string') {
    account.privateKey = account.privateKey.replace(/\\n/g, '\n');
  }
  if (typeof account.private_key === 'string') {
    account.private_key = account.private_key.replace(/\\n/g, '\n');
  }
  return account;
}

function getCredential() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    return cert(parseServiceAccount(serviceAccountJson));
  }

  const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (serviceAccountBase64) {
    const decoded = Buffer.from(serviceAccountBase64, 'base64').toString('utf8');
    return cert(parseServiceAccount(decoded));
  }

  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (keyPath) {
    const resolved = path.isAbsolute(keyPath)
      ? keyPath
      : path.resolve(process.cwd(), keyPath);
    return cert(JSON.parse(fs.readFileSync(resolved, 'utf8')) as ServiceAccount);
  }

  return undefined;
}

function getApp(): App {
  if (!app) {
    const existing = getApps();
    if (existing.length > 0) {
      app = existing[0];
    } else {
      const credential = getCredential();
      app = credential
        ? initializeApp({ credential })
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

export function getStorageAdmin(): Storage {
  return getStorage(getApp());
}
