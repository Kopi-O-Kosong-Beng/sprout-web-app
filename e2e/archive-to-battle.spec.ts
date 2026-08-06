import {
  test,
  expect,
  signInAsSeededOwner,
  signInThroughForm,
} from './fixtures';

/**
 * The core loop, from the user's side: own creatures, take one into a battle.
 *
 * This is the journey the integration suites cannot prove. They assert that the
 * battle engine is deterministic and that the repository persists a session —
 * both true, both already covered — but neither shows that a person can get
 * from their archive to a battle they can actually play. Every layer is real:
 * real browser, real React build, real Express, real Firestore emulator. Only
 * the four paid providers behind the sprite pipeline are substituted, and this
 * journey never touches them.
 *
 * Assertions are on text a user would recognise, not on "the page is not
 * blank". A blank-page check passes for any route that renders a shell, which
 * would let the archive silently stop listing creatures without failing here —
 * the first draft of this spec did exactly that and passed.
 */
test.describe('archive to battle', () => {
  test('a seeded creature can be taken from the archive into a battle', async ({
    page,
  }) => {
    await signInAsSeededOwner(page);
    await page.goto('/archive');

    await expect(page.getByRole('heading', { name: /archive/i })).toBeVisible({
      timeout: 20_000,
    });

    // The archive-to-PVE shortcut — UC4 alternative path A3, rendered in the
    // detail panel as "Battle with <name>".
    //
    // A *button*, not a link: it calls onBattle rather than navigating, so
    // getByRole('link') finds nothing. Scoped to <main> as well, because the
    // header carries a "PVE Battle" nav link — matching that instead would make
    // this spec pass without the shortcut existing at all, which is exactly
    // what the first draft did.
    const shortcut = page
      .getByRole('main')
      .getByRole('button', { name: /battle with/i })
      .first();
    await expect(shortcut).toBeVisible({ timeout: 20_000 });
    await shortcut.click();

    await page.waitForURL(/\/battle/, { timeout: 20_000 });

    // The battle surface itself, not merely the URL.
    await expect(page.getByText(/pve battle lab/i)).toBeVisible({ timeout: 20_000 });

    // "No battle plants yet" is the page's own empty state. Its ABSENCE is what
    // proves the seeded creatures reached the battle screen — the actual
    // end-to-end claim. Asserting only that the page rendered would pass on the
    // empty state, which is how the first draft of this spec passed while the
    // account it signed in as owned nothing.
    await expect(page.getByRole('heading', { name: /no battle plants yet/i })).toHaveCount(
      0
    );
  });

  test('a brand-new account is told to collect a plant first', async ({ page }) => {
    // The real form mints an account that owns nothing. The empty state is a
    // genuine user journey, not a failure, and it is the one the login shortcut
    // actually produces — so it gets asserted rather than worked around.
    await signInThroughForm(page);
    await page.goto('/battle');

    await expect(page.getByRole('heading', { name: /no battle plants yet/i })).toBeVisible(
      { timeout: 20_000 }
    );
    await expect(page.getByRole('link', { name: /return to archive/i })).toBeVisible();
  });

  test('the leaderboard renders for a signed-in player', async ({ page }) => {
    await signInAsSeededOwner(page);
    await page.goto('/leaderboard');

    await expect(page).toHaveURL(/\/leaderboard/);
    // Leaderboards are read-only projections of battle and dex data, so they
    // must render for a player who has not battled yet rather than erroring.
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 20_000 });
  });
});
