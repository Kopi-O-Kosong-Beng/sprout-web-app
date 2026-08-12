/** The studio's test runner must not depend on how the server was launched.
 *
 *  runTests() used to receive process.cwd(). A server started from anywhere
 *  but server/ handed vitest a directory with no vitest.config.ts, vitest
 *  matched no test files, wrote a perfectly valid all-zero JSON report, and
 *  the Unit Tests page showed four zero tiles with no explanation. This pins
 *  the anchor that replaced it: the runner resolves the server package root
 *  from its own module location, wherever the process happens to sit.
 */
import path from 'node:path';
import { existsSync } from 'node:fs';
import { resolveServerRoot } from '../platform/testRunner';

describe('resolveServerRoot', () => {
  it('returns the directory that holds vitest.config.ts', () => {
    const root = resolveServerRoot();
    expect(existsSync(path.join(root, 'vitest.config.ts'))).toBe(true);
  });

  it('does not depend on the process working directory', () => {
    const before = process.cwd();
    try {
      // The exact wrong-cwd scenario from the field: a server launched from
      // somewhere with no vitest config anywhere above it.
      process.chdir(path.parse(before).root);
      expect(resolveServerRoot()).toBe(path.resolve(__dirname, '..'));
    } finally {
      process.chdir(before);
    }
  });
});
