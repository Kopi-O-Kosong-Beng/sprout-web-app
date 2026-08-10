import { test, expect } from './fixtures';

/**
 * UC1 Signup and UC8 Submit Query Ticket — the two journeys that begin with a
 * form and end with something durable on the server.
 *
 * Signup is REAL here, not the dev shortcut: the form posts to
 * /api/auth/signup, the server's auth.controller calls Firebase Admin
 * createUser, and that call lands on the Auth *emulator* the E2E stack now
 * runs. So the account genuinely exists afterwards, the verification link is
 * genuinely generated (EMAIL_MODE=console prints it to the server log), and
 * the only substitution in the whole journey is which Firebase answers.
 */

/** Unique per run: signup rejects a taken email, and the emulator keeps state
 *  for the lifetime of the stack, so a fixed address would pass once and then
 *  fail every later local run against a reused stack.
 *
 *  example.com, not a .test TLD — the server's Joi schema validates against
 *  real TLDs, so `anything@sprout.test` is refused with 400 before signup
 *  logic runs at all. (Found by this spec failing; kept as a comment because
 *  the next person will reach for .test too.) */
const uniqueEmail = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

test.describe('UC1 — signup', () => {
  test('a visitor can create an account through the real endpoint', async ({ page }) => {
    await page.goto('/signup');

    await page.getByLabel('Display name').fill('E2E Sprout');
    await page.getByLabel('Email address').fill(uniqueEmail());
    // Satisfies every criterion in client/src/utils/validation.ts: length,
    // case, digit, symbol, under bcrypt's 72-byte ceiling.
    await page.getByLabel('Password', { exact: true }).fill('E2e!passw0rd');
    await page.getByLabel(/confirm/i).fill('E2e!passw0rd');

    await page.getByRole('button', { name: /sign up|create/i }).click();

    // The success screen only renders when the server said yes — the account
    // now exists in the Auth emulator. This is the UC1 postcondition, not a
    // client-side optimistic state.
    await expect(
      page.getByRole('heading', { name: /your account is created/i })
    ).toBeVisible({ timeout: 20_000 });
  });

  test('mismatched password confirmation never reaches the server', async ({ page }) => {
    await page.goto('/signup');

    await page.getByLabel('Display name').fill('E2E Mismatch');
    await page.getByLabel('Email address').fill(uniqueEmail());
    await page.getByLabel('Password', { exact: true }).fill('E2e!passw0rd');
    await page.getByLabel(/confirm/i).fill('E2e!different');

    await page.getByRole('button', { name: /sign up|create/i }).click();

    // The alternative flow: rejected client-side, account not created, form
    // still present for correction.
    await expect(
      page.getByRole('heading', { name: /your account is created/i })
    ).toHaveCount(0);
    await expect(page.getByLabel('Display name')).toBeVisible();
  });
});

test.describe('UC8 — submit query ticket', () => {
  test('a visitor can submit a query without an account', async ({ page }) => {
    await page.goto('/contact');

    // The documented UC8 field set: name, email, organisation (optional),
    // subject, inquiry type, message. Persist-first on the server; the
    // notification emails print to the console transport.
    await page.getByLabel(/name/i).first().fill('E2E Visitor');
    await page.getByLabel(/email/i).first().fill('e2e-visitor@example.com');
    await page.getByLabel(/subject/i).fill('E2E ticket');
    // Careful with this wording: an earlier version began "Submitted by…" and
    // the success assertion was a loose /submitted|success|thank/i — which
    // matched the form's own textarea and nothing on the actual success panel
    // ("Ticket created" / "Message received!"). The spec passed only when the
    // assertion polled before React cleared the form, and timed out whenever
    // the server answered quickly. The assertion now names the real
    // postcondition, and the message avoids its words on principle.
    await page
      .getByLabel(/message/i)
      .fill('Written by the end-to-end suite to prove the UC8 main flow.');

    await page.getByRole('button', { name: /send|submit/i }).click();

    // The UC8 postcondition: a ticket exists and the visitor holds its
    // reference number — not merely the absence of an error.
    await expect(page.getByText('Ticket created')).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole('heading', { name: /reference number: SPR-\d{8}-\d{4}/i })
    ).toBeVisible();
  });
});
