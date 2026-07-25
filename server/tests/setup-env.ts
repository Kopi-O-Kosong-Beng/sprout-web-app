/** Jest setupFile: isolates Firebase Admin to the local Firestore Emulator. */
process.env.NODE_ENV = 'test';
process.env.GCLOUD_PROJECT = 'sprout-test';
process.env.GOOGLE_CLOUD_PROJECT = 'sprout-test';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.EMAIL_MODE = 'console';
process.env.BCRYPT_COST = '4';
delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
delete process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
