import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { cleanServerDist } from '../scripts/clean-dist';

describe('server clean build helper', () => {
  it('removes the complete dist tree without touching sibling files', () => {
    const serverRoot = mkdtempSync(path.join(tmpdir(), 'sprout-clean-dist-'));
    const obsoleteSqliteFile = path.join(
      serverRoot,
      'dist',
      'repositories',
      'auth-user.repo.sqlite.js'
    );
    const siblingFile = path.join(serverRoot, 'keep.txt');
    mkdirSync(path.dirname(obsoleteSqliteFile), { recursive: true });
    writeFileSync(obsoleteSqliteFile, 'obsolete sqlite sentinel');
    writeFileSync(siblingFile, 'keep');

    try {
      cleanServerDist(serverRoot);

      expect(existsSync(path.join(serverRoot, 'dist'))).toBe(false);
      expect(existsSync(siblingFile)).toBe(true);
    } finally {
      rmSync(serverRoot, { recursive: true, force: true });
    }
  });
});
