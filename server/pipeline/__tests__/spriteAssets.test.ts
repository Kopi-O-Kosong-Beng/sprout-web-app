/** Guards the pact between seeded sprite URLs and the files on disk.
 *
 *  The pots-only bug shipped twice because nothing connected the URLs the
 *  server hands out (demo-avatar-templates.ts, sprite-catalog.ts) to the files
 *  under client/public — first /static/sprites/ pointed at a directory nothing
 *  served, then /plants/ pointed at art that was never committed. Both times
 *  every <img> 404'd and the archive silently degraded to bare pots.
 *
 *  Lives beside the pipeline suites because the pipeline is what renders these
 *  files (generate-sprites.ts, generate-demo-plants.ts), and because this
 *  vitest config is the standalone no-emulator suite where an fs check belongs.
 *
 *  Demo photo files (IMG_*.jpg) are deliberately not asserted — the specimen
 *  card omits a missing photograph by design, and no photographs have ever
 *  been committed.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_AVATAR_TEMPLATES } from '../../data/demo-avatar-templates';
import { SPRITE_CATALOG } from '../../data/sprite-catalog';

const PUBLIC_DIR = path.resolve(__dirname, '../../../client/public');

describe('sprite assets referenced by seed data', () => {
  it.each(DEMO_AVATAR_TEMPLATES.map((t) => [t.spriteFile, t.speciesName]))(
    'ships /plants/%s (%s)',
    (spriteFile) => {
      expect(existsSync(path.join(PUBLIC_DIR, 'plants', spriteFile))).toBe(true);
    }
  );

  it.each(SPRITE_CATALOG.map((entry) => [entry.slug, entry.usedBy]))(
    'ships /sprites/%s.png (%s)',
    (slug) => {
      expect(existsSync(path.join(PUBLIC_DIR, 'sprites', `${slug}.png`))).toBe(true);
    }
  );
});
