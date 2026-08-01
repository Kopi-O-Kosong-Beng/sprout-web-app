import { defineConfig } from 'vitest/config';

/**
 * Vitest covers the migrated sprite-pipeline suites only. The 24 pre-existing
 * server suites under tests/ stay on Jest — they are written against Jest's
 * globals and driven by the Firestore-emulator runner, and converting them would
 * be a rewrite with no benefit.
 *
 * Vitest also has to remain installed here for a second reason: the studio's
 * Unit Tests page shells out to `npx vitest run` and shows the real terminal
 * output, so the runner is a runtime dependency of that feature, not only a
 * development one.
 */
export default defineConfig({
  test: {
    include: ['pipeline/**/__tests__/**/*.test.ts'],
    /*
     * Coverage is on by default so a run always reports it.
     *
     * Caveat worth stating in any report that quotes these numbers: v8 measures
     * statement, branch, function and line coverage. Branch coverage counts
     * whether each branch was taken — it does NOT prove condition coverage or
     * MCDC. A compound condition like `a && b` can show 100% branch coverage
     * while never demonstrating that `b` independently affects the outcome. The
     * [MCDC]-tagged tests exist precisely because this tool cannot establish
     * that on its own.
     */
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'html'],
      include: ['pipeline/**/*.ts', 'platform/**/*.ts'],
      exclude: ['pipeline/__tests__/**', '**/*.d.ts'],
    },
  },
});
