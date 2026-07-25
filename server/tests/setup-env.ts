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

// Entry points import ../env, which runs dotenv against the developer's real
// server/.env. dotenv does not overwrite variables that already exist, so
// pinning the values the suites assert on keeps results identical on a
// configured laptop and on CI (where no .env file exists). Without this, a
// local FRONTEND_URL=...:5180 or EMAIL_MODE=smtp silently fails the auth and
// email suites.
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.CORS_ORIGIN = 'http://localhost:5173';
// Transport credentials must stay absent so "missing config" cases are real.
delete process.env.SMTP_HOST;
delete process.env.SMTP_PORT;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;
delete process.env.EMAIL_FROM;
delete process.env.RESEND_API_KEY;
delete process.env.RESEND_FROM;
