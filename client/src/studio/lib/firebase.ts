/**
 * Firebase access for the studio.
 *
 * Sprout_Dev_Platform initialised its own Firebase app from a checked-in
 * `firebase-applet-config.json`. This app already initialises one from the
 * VITE_FIREBASE_* environment variables, and two apps would mean two auth
 * sessions — signing in to the studio would not sign you in to the game.
 *
 * So this is a shim: it re-exports the single shared app's auth, adds the
 * Firestore handle the studio needs (the game only ever used auth), and keeps
 * the exact export surface the studio components were written against, so those
 * components are unmodified copies.
 */
import { getFirestore } from 'firebase/firestore';
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import {
  getSproutFirebaseApp,
  getSproutFirebaseAuth,
  isFirebaseConfigured,
} from '../../services/firebaseClient';

/**
 * Stand-in for a handle that cannot be built because VITE_FIREBASE_* is absent.
 *
 * Both exports below used to be resolved eagerly, which threw during module
 * evaluation in a checkout with no Firebase config — and because App.tsx routes
 * to the studio, that import chain took down the entire SPA. Every page went
 * blank, including the landing page, which needs no Firebase at all. The
 * comment on `auth` even said this was the thing to avoid.
 *
 * Importing is safe now, and only *using* a handle fails, with a message that
 * names the missing config instead of "cannot read properties of undefined".
 * The studio is sign-in-gated anyway, so it was never usable without this
 * config — the difference is that the rest of the app no longer cares.
 */
function unconfigured<T extends object>(handle: string): T {
  const explain = () => {
    throw new Error(
      `The studio's ${handle} needs VITE_FIREBASE_* in client/.env.local.`
    );
  };
  return new Proxy({} as T, { get: explain, has: explain, set: explain });
}

export const auth: Auth = isFirebaseConfigured()
  ? getSproutFirebaseAuth()
  : unconfigured<Auth>('auth handle');

/**
 * Firestore database id. The studio's dex and user_profiles collections live in
 * the same database the rest of Sprout uses, so this follows the app's own
 * config rather than the platform's separate `firestoreDatabaseId` field.
 */
const databaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID || '(default)';

export const db: Firestore = isFirebaseConfigured()
  ? getFirestore(getSproutFirebaseApp(), databaseId)
  : unconfigured<Firestore>('Firestore handle');

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export {
  addDoc,
  collection,
  deleteDoc,
  doc,
  firebaseSignOut,
  getDoc,
  getDocs,
  onAuthStateChanged,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
};

export type { User };

/** Sign in with Google, falling back to a redirect when the popup is blocked. */
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    await syncUserProfile(result.user);
    return result.user;
  } catch (error: unknown) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
    console.warn('Popup sign-in failed, trying redirect mode...', error);
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/popup-closed-by-user' ||
      code === 'auth/cancelled-popup-request'
    ) {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw error;
  }
}

/** Completes a redirect sign-in on app startup. */
export async function checkRedirectAuth() {
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      await syncUserProfile(result.user);
      return result.user;
    }
  } catch (error) {
    console.error('Error processing redirect result:', error);
  }
  return null;
}

/** Mirrors the signed-in user into the Firestore `user_profiles` collection. */
export async function syncUserProfile(user: User) {
  if (!user) return;
  const userRef = doc(db, 'user_profiles', user.uid);
  const now = new Date().toISOString();

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        displayName: user.displayName || 'Anonymous User',
        email: user.email || '',
        photoURL: user.photoURL || '',
        createdAt: now,
        lastLoginAt: now,
      });
    } else {
      await updateDoc(userRef, {
        displayName: user.displayName || snap.data().displayName,
        photoURL: user.photoURL || snap.data().photoURL,
        lastLoginAt: now,
      });
    }
  } catch (err) {
    console.error('Failed to sync user profile to Firestore:', err);
  }
}

export async function logoutUser() {
  await firebaseSignOut(auth);
}
