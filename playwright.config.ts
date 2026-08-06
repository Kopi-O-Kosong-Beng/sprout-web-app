import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration.
 *
 * E2E here means what the course means by it: a journey that starts at the user
 * and ends at the user. A real browser drives the real React build, which calls
 * the real Express server, which reads and writes a real Firestore — the
 * emulator rather than production, but the same client library and the same
 * queries. Nothing between the click and the database is mocked.
 *
 * ── What IS substituted, and why that is not cheating ────────────────────────
 * The four third-party providers behind the sprite pipeline (Plant.id, Gemini,
 * remove.bg, and the mail transport) are replaced by the server's own
 * USE_MOCK_APIS fixtures. Two reasons, both deliberate:
 *   1. Every real run costs money. A suite that bills the team per execution is
 *      a suite nobody runs, and an unrun test is worth nothing.
 *   2. Their output is non-deterministic. Asserting on a genuinely generated
 *      image means asserting on something that legitimately differs run to run.
 * The seam is the provider boundary, and it is disclosed here and in the report
 * rather than left for a reader to discover.
 *
 * ── Why this DOES run on every pull request ─────────────────────────────────
 * The CI budget policy reserved E2E for on-demand runs. That policy was written
 * when E2E was hypothetical and assumed to be expensive: real provider calls,
 * real credentials, minutes per run. This suite is none of those things — it
 * needs no secret, makes no paid call, and finishes in under a minute — so the
 * budget argument does not apply to it, and the evidence is worth more on every
 * PR than on the days someone remembers to run it.
 *
 * The expensive thing the policy was protecting against still exists and is
 * still gated: `fuzz:live` in .github/workflows/fuzz-live.yml is manual-only.
 */
export default defineConfig({
  testDir: './e2e',

  /*
   * Serial, not parallel. The suite shares one Firestore emulator and one dev
   * account, so two workers racing on the same archive would produce failures
   * that say nothing about the application. Correctness of the signal is worth
   * more than wall-clock time in a suite that runs on demand.
   */
  fullyParallel: false,
  workers: 1,

  /* A retry absorbs genuine browser flake (a slow first paint, an animation
   * still settling). More than one starts hiding real intermittent bugs. */
  retries: process.env.CI ? 1 : 0,

  /* Fail the run if a spec is left focused. Committing test.only silently
   * disables everything else, and a green tick that ran one test is worse than
   * a red one. */
  forbidOnly: Boolean(process.env.CI),

  timeout: 45_000,
  expect: { timeout: 10_000 },

  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173',

    /* Evidence on failure, nothing on success. A trace is the difference
     * between "the archive assertion failed" and seeing the exact DOM, network
     * calls and console output at the moment it did. */
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /*
   * The stack is started by scripts/e2e-stack.mjs rather than by three
   * webServer entries, because the ordering is a real dependency chain: the
   * Firestore emulator must be accepting connections before the API opens its
   * port, or the API's first query fails for a reason that has nothing to do
   * with the code under test. Playwright's webServer array has no
   * "wait for this one first" primitive.
   *
   * Set E2E_BASE_URL to point the suite at an already-running stack (a deployed
   * preview, say) and skip local orchestration entirely.
   */
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'node scripts/e2e-stack.mjs',
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
});
