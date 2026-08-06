import { test, expect, signInAsSeededOwner } from './fixtures';

/**
 * UC5 — a battle turn actually resolves.
 *
 * The archive-to-battle spec proves a creature can be *taken into* a battle;
 * this one proves the battle can be *played*: pick a combatant, start the
 * match, commit a move, and watch the turn counter advance. That last step is
 * the part no other tier covers from the user's side — the engine's
 * determinism is property-tested and the repository's transactions are
 * integration-tested, but "a person clicks a move and the fight moves on" only
 * exists here.
 *
 * Reduced motion is emulated deliberately. The turn cinematic plays the
 * server's log beat by beat in real time; under prefers-reduced-motion the
 * client collapses it to an instant resolve (the same path its jsdom tests
 * exercise). The spec is about the turn resolving, not the choreography, and
 * skipping the choreography also keeps the spec fast and unflaky.
 */
test.describe('UC5 — PVE battle', () => {
  test('a match starts and a committed move advances the turn', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signInAsSeededOwner(page);

    // Enter through the archive shortcut rather than picking off the /battle
    // roster: it preselects the combatant (UC4 A3 feeding UC5, exactly as the
    // sequence diagrams draw it), and it avoids a trap the first draft hit —
    // "the first button in <main>" on the battle page is the Back button, and
    // clicking it navigates away while the spec waits for a match that will
    // never start.
    await page.goto('/archive');
    await page
      .getByRole('main')
      .getByRole('button', { name: /battle with/i })
      .first()
      .click();
    await page.waitForURL(/\/battle/, { timeout: 20_000 });

    await expect(page.getByText(/pve battle lab/i)).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /start match/i }).click();

    // The fight surface: turn 1, and a move grid. Both must exist before the
    // player can act — asserting only the URL would pass on a setup screen
    // that never transitioned.
    await expect(page.getByText(/turn 1/i).first()).toBeVisible({ timeout: 20_000 });
    const moves = page.getByRole('group', { name: 'Battle moves' });
    await expect(moves).toBeVisible();

    // Commit the first *enabled* move. Energy starts at 0, so some moves are
    // legitimately disabled with a stated reason — picking blindly at index 0
    // would make the spec fail on a rule working correctly.
    await moves.locator('button:enabled').first().click();

    // The claim: the turn RESOLVED. Player move applied, bot move applied,
    // session persisted, next turn prepared. "Turn 2" is the server's own
    // counter surfaced in the UI, so it cannot appear unless the round-trip
    // genuinely completed.
    await expect(page.getByText(/turn 2/i).first()).toBeVisible({ timeout: 30_000 });
  });
});
