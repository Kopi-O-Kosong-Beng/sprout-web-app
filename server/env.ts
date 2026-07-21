/** Loads server/.env as a module side effect. Import this FIRST in any entry
 *  point (app, scripts) so env vars exist before other modules evaluate —
 *  TypeScript hoists imports, so a bare `dotenv.config()` statement would run
 *  too late for modules that read configuration at load. */
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '.env') });
