/** Loads server/.env as a module side effect. Import this FIRST in any entry
 *  point (app, scripts) so env vars exist before other modules evaluate —
 *  TypeScript hoists imports, so a bare `dotenv.config()` statement would run
 *  too late for modules that read configuration at load. */
import path from 'path';
import dotenv from 'dotenv';

// Never load the file under test. tests/setup-env.ts pins the values the suites
// assert on and clears the ones that must stay absent, but dotenv only skips
// keys already present in process.env — so a *deleted* key gets refilled from
// the developer's real .env the moment an entry point imports this module. A
// laptop with FIREBASE_SERVICE_ACCOUNT_PATH set then fails every suite that
// touches Firestore, while CI (which has no .env) stays green. Skipping the
// load makes the local run identical to CI.
if (process.env.NODE_ENV !== 'test') {
  dotenv.config({ path: path.join(__dirname, '.env') });
}
