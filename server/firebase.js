/** Firebase Admin SDK init — lazy, so SQLite-mode runs never require a key.
 *  Final architecture per Master.docx: Firestore (cross-platform DB shared with
 *  the mobile app), Firebase Auth (ID-token verification), Cloud Storage (PM3).
 *
 *  Setup: see FIREBASE_SETUP.md. Key file is gitignored — never commit it.
 */
const path = require('path');
const admin = require('firebase-admin');

let initialised = false;

function getAdmin() {
  if (!initialised) {
    const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    if (keyPath) {
      admin.initializeApp({
        // eslint-disable-next-line import/no-dynamic-require, global-require
        credential: admin.credential.cert(require(path.resolve(__dirname, keyPath))),
      });
    } else {
      // Falls back to GOOGLE_APPLICATION_CREDENTIALS / emulator env
      // (FIRESTORE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST)
      admin.initializeApp();
    }
    initialised = true;
  }
  return admin;
}

function getDb() {
  return getAdmin().firestore();
}

module.exports = { getAdmin, getDb };
