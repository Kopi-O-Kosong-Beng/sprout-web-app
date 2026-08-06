import path from 'node:path';
import { test, expect, signInAs, DEV_ADMIN_UID } from './fixtures';

/**
 * UC6 → UC4: the product's core promise, walked as a user.
 *
 * Upload a photo, watch the six pipeline stages stream back, and find the
 * creature persisted in the archive afterwards. This is the journey the whole
 * project exists for, and until the Storage emulator joined the E2E stack it
 * was untestable end to end — sprite-storage.ts throws without a bucket, so
 * the scan could complete its stages and still fail to persist.
 *
 * What is real: the browser, the React build, the SSE stream, the ingest gate
 * (this upload passes through the same validateUploadedImage the fuzzer
 * attacks), the Express server, Firestore, and the Storage write. What is
 * substituted: the four paid providers, via USE_MOCK_APIS — identification
 * always answers "Polygala calcarea" (0.92, family Polygalaceae) and the
 * sprite is the procedural placeholder. Deterministic on purpose: this spec
 * asserts a species NAME, which only a fixed identification makes possible.
 *
 * The fixture photo is a real JPEG from the fuzzer's own seed corpus — one
 * more place the suites deliberately share inputs instead of inventing
 * parallel ones.
 */
// Resolved from the repo root — Playwright runs with the config's directory as
// cwd, and import.meta is unavailable under its CommonJS transform.
const PHOTO = path.resolve(
  'client/src/studio/pipeline/goldenset/photos/hydrangea.jpg'
);

/** The mock identification's answer, from server/pipeline/stages/identify.ts. */
const MOCK_SPECIES = 'Polygala calcarea';

test.describe('UC6 → UC4 — scan to archive', () => {
  test('an uploaded photo becomes a persisted creature in the archive', async ({
    page,
  }) => {
    // The longest journey in the suite: a real image through resize, the
    // ingest gate, six streamed stages, a Storage write and two navigations.
    test.setTimeout(120_000);

    // The dev-admin account owns nothing at stack start (the seed belongs to
    // demo-user-0001), so the creature asserted at the end can only have come
    // from THIS scan — not from seed data the assertion happens to match.
    await signInAs(page, DEV_ADMIN_UID);
    await page.goto('/scan');

    // Open the upload overlay the way a user does. Two hidden file inputs
    // exist: the camera fallback (accept="image/*" capture) mounts with the
    // page, while the web-upload input (accept="image/jpeg,...") lives inside
    // this overlay — targeting "the last input" grabbed whichever happened to
    // be mounted, which is how the first draft of this spec silently fed the
    // camera path nothing.
    await page.getByRole('button', { name: /^upload$/i }).click();
    const fileInput = page.locator('input[type="file"][accept*="jpeg"]');
    await fileInput.setInputFiles(PHOTO);

    // The six stages stream over SSE. The result overlay names the species —
    // that exact dialog is the UC6 main-flow postcondition surfaced to the
    // user. Generous timeout: mock providers are instant but sharp still
    // resizes and quantises a real image.
    await expect(page.getByText(MOCK_SPECIES).first()).toBeVisible({
      timeout: 60_000,
    });

    // "Saved to your archive." is the persistence claim in the UI. Asserting
    // it here means a run that renders a sprite but fails the Firestore or
    // Storage write cannot pass.
    await expect(page.getByText(/saved to your archive/i)).toBeVisible({
      timeout: 30_000,
    });

    // UC4: the record survives navigation — this is persistence, not the
    // result dialog's local state. A previously-empty account now has exactly
    // the scanned species in its archive.
    await page.goto('/archive');
    await expect(page.getByRole('heading', { name: /archive/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(MOCK_SPECIES).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
