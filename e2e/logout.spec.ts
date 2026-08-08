import { test, expect, signInThroughForm } from './fixtures';

/**
 * UC2 (session lifecycle) — signing out, as a round trip.
 *
 * The gap this closes: the suite could sign in and could assert that an
 * anonymous visitor is kept out, but nothing connected the two. "Log out
 * works" was inferred from those two facts rather than observed, and the
 * inference is exactly the kind that hides a real defect — a header that flips
 * to signed-out while the session record survives in storage satisfies both
 * existing specs and still leaves the account reachable on the next reload.
 *
 * So this drives the whole loop in one browser: sign in through the real form,
 * open a protected route, click the real Log out control, and then check three
 * independent things rather than one.
 *
 *   1. THE UI FLIPPED       — the header stops offering Log out and offers
 *                             Sign up / Log in again.
 *   2. THE SESSION IS GONE  — the localStorage record AuthContext writes is
 *                             actually removed, not merely ignored by a
 *                             re-render. This is the assertion that separates
 *                             "signed out" from "looks signed out".
 *   3. THE DOOR RE-LOCKED   — a protected route bounces to /login again.
 *
 * Those three are not redundant, and that was verified rather than assumed:
 * stubbing endDevSession() to leave the record in place kept assertion 1
 * PASSING — React state had still been cleared, so the header flipped exactly
 * as a working sign-out would — while assertions 2 and 3 both failed. A spec
 * that only checked the header would have been green against a sign-out that
 * left the account reachable on the next reload.
 *
 * ── How this differs from the tiers below it ────────────────────────────────
 * client/src/context/AuthContext.logout.test.tsx already unit-tests logout()
 * as a function, with Firebase mocked: the audit-then-sign-out order, the
 * audit-failure path, the dev-session branch, and the unconfigured-Firebase
 * case. server/tests/auth.test.ts covers POST /api/auth/session/logout at the
 * API tier.
 *
 * Neither can observe what this does. They call logout() directly, so they
 * cannot tell whether the header button is wired to it, whether the redirect
 * happens, whether a REAL browser's localStorage is actually emptied (jsdom's
 * is a shim), or whether the route guard re-engages afterwards. Those four are
 * this spec's whole reason to exist.
 *
 * ── What it deliberately does not cover ─────────────────────────────────────
 * The stack signs in through the local dev-session shortcut, and logout()
 * returns early on that path — it clears the record and sets state directly,
 * without POSTing /api/auth/session/logout. The server-side audit write
 * (lastLogout) is therefore NOT exercised here; the two tiers named above own
 * it. Saying so is more useful than a test that quietly implies otherwise.
 */
test.describe('UC2 — sign out', () => {
  const SESSION_KEY = 'sprout-dev-session';

  test('signing out clears the session and re-locks protected routes', async ({
    page,
  }) => {
    await signInThroughForm(page);

    // Precondition, asserted rather than assumed: the account really can open a
    // protected route right now. Without this the test could pass against a
    // session that was already broken before the click.
    await page.goto('/archive');
    await expect(page.getByRole('heading', { name: /archive/i })).toBeVisible({
      timeout: 20_000,
    });

    const logoutButton = page.getByRole('button', { name: /log out/i });
    await expect(logoutButton).toBeVisible();
    await expect(
      await page.evaluate((key) => window.localStorage.getItem(key), SESSION_KEY)
    ).not.toBeNull();

    await logoutButton.click();

    // handleLogout navigates home after the session is torn down.
    await page.waitForURL((url) => new URL(url).pathname === '/', {
      timeout: 20_000,
    });

    // 1. The UI flipped.
    await expect(page.getByRole('button', { name: /log out/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^sign up$/i })).toBeVisible();

    // 2. The session record is gone from storage. A header that merely stopped
    //    rendering the identity would pass assertion 1 and fail here.
    const stored = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      SESSION_KEY
    );
    expect(stored).toBeNull();

    // 3. The door re-locked. This is the same guard public-access.spec.ts
    //    proves for a visitor who never signed in; the point here is that it
    //    applies again *after* a session has existed and been ended.
    await page.goto('/archive');
    await page.waitForURL(/\/login/, { timeout: 20_000 });
    await expect(page.getByLabel('Email address')).toBeVisible();
  });

  test('the signed-out state survives a reload', async ({ page }) => {
    // Separate from the assertions above on purpose. Those inspect the tab that
    // performed the sign-out, where React state alone could account for every
    // one of them. A reload throws that state away and rebuilds from storage,
    // so only a genuinely cleared record keeps the user out — this is the case
    // that would catch a logout which forgot to persist its own effect.
    await signInThroughForm(page);

    await page.getByRole('button', { name: /log out/i }).click();
    await page.waitForURL((url) => new URL(url).pathname === '/', {
      timeout: 20_000,
    });

    await page.reload();

    await expect(page.getByRole('link', { name: /^sign up$/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('button', { name: /log out/i })).toHaveCount(0);

    await page.goto('/archive');
    await page.waitForURL(/\/login/, { timeout: 20_000 });
  });
});
