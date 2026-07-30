import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export function isFirebaseConfigured(): boolean {
  return Object.values(firebaseConfig).every((value) => Boolean(value));
}

/** The one Firebase app for the whole client — auth and Firestore share it, so
 *  signing in to the game signs you in to the studio too. */
export function getSproutFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase web config is missing in client/.env.local.');
  }
  return getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
}

export function getSproutFirebaseAuth(): Auth {
  return getAuth(getSproutFirebaseApp());
}
