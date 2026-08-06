import { test, expect } from './fixtures';

/**
 * What a visitor with no account can reach.
 *
 * This is a security boundary as much as a feature: the almanac is public by
 * design, and the archive, battles and operator tools are not. Both halves are
 * asserted here, because "the public page loads" and "the private page does not
 * load for the public" are the same requirement seen from two sides, and only
 * testing the first is how a route quietly becomes world-readable.
 */
test.describe('unauthenticated visitor', () => {
  test('reaches the landing page and is offered a way in', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));

    await page.goto('/');
    await expect(page).toHaveTitle(/sprout/i);

    // A rendered heading, not merely a non-empty root: a white screen caused by
    // a JS error still returns HTTP 200 and still has a root element.
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 20_000 });

    // A visitor with no account must be offered a route in from the public page.
    await expect(
      page.getByRole('link', { name: /log ?in|sign ?in|sign ?up|get started/i }).first()
    ).toBeVisible();

    // The landing page is the first thing an assessor opens. A console error
    // here is visible in devtools during a live demo.
    expect(consoleErrors).toEqual([]);
  });

  test('is kept out of the archive until signed in', async ({ page }) => {
    await page.goto('/archive');

    // The route guard should send an anonymous visitor to login rather than
    // rendering an empty archive, which would leak the shape of the feature and
    // look broken.
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    await expect(page.getByLabel('Email address')).toBeVisible();
  });

  test('is kept out of the operator dashboard', async ({ page }) => {
    await page.goto('/admin');

    // Fail-closed: no session means no operator surface. The server enforces
    // this independently (admin.middleware.ts) — this asserts the client does
    // not render the shell either.
    await expect(page).not.toHaveURL(/\/admin$/, { timeout: 15_000 });
  });
});
