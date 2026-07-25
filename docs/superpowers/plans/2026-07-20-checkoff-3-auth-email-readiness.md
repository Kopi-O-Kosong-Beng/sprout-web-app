# Checkoff 3 Auth and Email Readiness Implementation Plan

> Superseded by 2026-07-22 Firestore-only design.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make UC1, UC2, UC3, and UC8 production-ready enough for Checkoff 3 by enabling real SMTP delivery, completing Firebase email verification/resend, enforcing verified routes and OTP attempt limits, stabilizing auth tests, and making ticket notifications independent.

**Architecture:** Firebase remains the identity and action-code authority. Express generates Firebase verification links, rewrites them to Sprout's custom handler, and sends all email through the existing Nodemailer adapter. SQLite and Firestore repositories persist application profile, OTP-attempt, ticket, and notification state behind existing interfaces.

**Tech Stack:** TypeScript, Express, Firebase Admin/JS SDK, Nodemailer, Joi, Knex/SQLite, Firestore, React 19, Jest, Supertest, Vitest, React Testing Library.

## Global Constraints

- The Sprout administrator mailbox is `hello.sprout.team@gmail.com`.
- Never commit, print, screenshot, or return `SMTP_PASS`, service-account JSON, Firebase tokens, OTP plaintext, or provider keys.
- Deployed email uses `EMAIL_MODE=smtp`; local development may use `console`; tests mock email or use `console`.
- Firebase ID tokens remain the only login bearer tokens. Do not add a custom JWT or signup OTP.
- Firebase action codes remain the signup-verification authority.
- Password-reset request returns the same generic message for known and unknown emails.
- Production bcrypt cost is at least 12. Tests may set `BCRYPT_COST=4` only when `NODE_ENV=test`.
- A ticket is authoritative once persisted. Submitter and admin email failures cannot roll it back.
- Frontend and backend must both reject unverified access to gameplay routes.
- Each task follows red-green-refactor and ends with a focused commit.

---

## File Structure

### Existing files to modify

- `server/services/email.service.ts`: SMTP transport and readiness verification.
- `server/services/auth.service.ts`: verification-link delivery/resend and reset-attempt behavior.
- `server/services/ticket.service.ts`: independent notification attempts.
- `server/controllers/auth.controller.ts`: resend handler.
- `server/routes/auth.routes.ts`: resend route/rate limit and display-name validation.
- `server/models/auth.ts`: OTP failed-attempt field/repository contract.
- `server/models/ticket.ts`: notification state/repository contract.
- `server/repositories/auth-user.repo.sqlite.ts`: OTP-attempt persistence.
- `server/repositories/auth-user.repo.firestore.ts`: OTP-attempt persistence.
- `server/repositories/ticket.repo.sqlite.ts`: ticket notification-state updates.
- `server/repositories/ticket.repo.firestore.ts`: ticket notification-state updates.
- `server/tests/setup-env.ts`: controlled test bcrypt cost.
- `server/tests/auth.test.ts`: UC1-UC3 regression and resend/attempt cases.
- `server/tests/query.test.ts`: UC8 pairwise notification cases.
- `client/src/context/AuthContext.tsx`: verification refresh behavior.
- `client/src/components/common/ProtectedRoute.tsx`: verified-only gameplay gate.
- `client/src/pages/LoginPage.tsx`: route unverified sessions to verification.
- `client/src/pages/SignupPage.tsx`: 50-character rule and mode-neutral copy.
- `client/src/services/sproutApi.ts`: resend API and signup result type.
- `client/src/App.tsx`: `/verify-email` route.
- `client/package.json`: Vitest and React Testing Library dependencies/scripts.
- `client/vite.config.ts`: Vitest jsdom configuration.
- `package.json`: root test scripts.
- `package-lock.json`: authoritative workspace dependency lock.
- `client/package-lock.json`: remove stale nested lock; the root workspace lock is authoritative.
- `.env.example`: current SMTP/Firebase action-handler variables.
- `render.yaml`: production SMTP variable declarations.
- `server/FIREBASE_SETUP.md`: custom handler and deployment instructions.

### New files

- `server/database/migrations/202607200001_add_auth_ticket_delivery_state.ts`: OTP-attempt and ticket-delivery columns.
- `server/tests/email.test.ts`: email transport contract.
- `server/scripts/check-email.ts`: secret-safe SMTP preflight/live verification.
- `client/src/pages/VerifyEmailPage.tsx`: Firebase action-code completion and resend UI.
- `client/src/pages/VerifyEmailPage.test.tsx`: page behavior.
- `client/src/components/common/ProtectedRoute.test.tsx`: verified-route behavior.
- `client/src/test/setup.ts`: DOM matcher setup when frontend test tooling lands.
- `client/src/test/setup.test.ts`: frontend test-runner smoke test.

---

### Task 1: Email Transport Contract and SMTP Preflight

**Files:**
- Modify: `server/services/email.service.ts`
- Create: `server/tests/email.test.ts`
- Create: `server/scripts/check-email.ts`
- Modify: `server/package.json`

**Interfaces:**
- Produces: `send(payload: EmailPayload): Promise<EmailResult>` with existing behavior.
- Produces: `verifyEmailTransport(): Promise<EmailTransportStatus>` where `EmailTransportStatus` is `{ mode: string; verified: boolean }`.
- Consumes: `EMAIL_MODE`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`.

- [ ] **Step 1: Write transport tests**

Create `server/tests/email.test.ts` with three explicit cases:

```ts
const mockVerify = jest.fn();
const mockSendMail = jest.fn();

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn(() => ({
      verify: mockVerify,
      sendMail: mockSendMail,
    })),
  },
}));

describe('email transport', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.EMAIL_FROM;
  });

  it('logs safely in console mode without constructing SMTP', async () => {
    process.env.EMAIL_MODE = 'console';
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const { send } = await import('../services/email.service');
    await expect(send({ to: 'a@example.com', subject: 'Subject', text: 'Body' }))
      .resolves.toEqual({ delivered: true, mode: 'console' });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('rejects missing SMTP configuration with the missing key name only', async () => {
    process.env.EMAIL_MODE = 'smtp';
    const { verifyEmailTransport } = await import('../services/email.service');
    await expect(verifyEmailTransport()).rejects.toThrow('SMTP_HOST');
  });

  it('verifies and sends through configured SMTP', async () => {
    process.env.EMAIL_MODE = 'smtp';
    process.env.SMTP_HOST = 'smtp.gmail.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'hello.sprout.team@gmail.com';
    process.env.SMTP_PASS = 'test-app-password';
    process.env.EMAIL_FROM = 'hello.sprout.team@gmail.com';
    mockVerify.mockResolvedValue(true);
    mockSendMail.mockResolvedValue({ messageId: 'test-id' });
    const { send, verifyEmailTransport } = await import('../services/email.service');
    await expect(verifyEmailTransport()).resolves.toEqual({ mode: 'smtp', verified: true });
    await expect(send({ to: 'a@example.com', subject: 'Subject', text: 'Body' }))
      .resolves.toEqual({ delivered: true, mode: 'smtp' });
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'hello.sprout.team@gmail.com',
      to: 'a@example.com',
    }));
  });
});
```

- [ ] **Step 2: Run the focused test and verify red**

Run:

```powershell
npm.cmd test -w server -- --runTestsByPath tests/email.test.ts
```

Expected: FAIL because `verifyEmailTransport` is not exported.

- [ ] **Step 3: Add transport verification**

Add this public function while retaining the cached transporter and existing `send` behavior:

```ts
export interface EmailTransportStatus {
  mode: string;
  verified: boolean;
}

export async function verifyEmailTransport(): Promise<EmailTransportStatus> {
  const mode = process.env.EMAIL_MODE ?? 'console';
  if (mode === 'console') return { mode, verified: true };
  if (mode !== 'smtp') throw new Error(`Unsupported EMAIL_MODE: ${mode}`);
  await getSmtpTransporter().verify();
  return { mode, verified: true };
}
```

Return `{ mode, verified }` from the wrapper script, not secret values:

```ts
import '../env';
import { verifyEmailTransport } from '../services/email.service';

verifyEmailTransport()
  .then((result) => {
    console.log(`[email-check] mode=${result.mode} verified=${result.verified}`);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown email error';
    console.error(`[email-check] failed: ${message}`);
    process.exitCode = 1;
  });
```

Add the script:

```json
"check:email": "tsx scripts/check-email.ts"
```

- [ ] **Step 4: Run focused verification**

Run:

```powershell
npm.cmd test -w server -- --runTestsByPath tests/email.test.ts
npm.cmd run typecheck -w server
```

Expected: all email tests pass and typecheck exits 0.

- [ ] **Step 5: Commit**

```powershell
git add server/services/email.service.ts server/tests/email.test.ts server/scripts/check-email.ts server/package.json
git commit -m "test: define SMTP delivery contract"
```

---

### Task 2: Independent UC8 Submitter and Admin Notifications

**Files:**
- Create: `server/database/migrations/202607200001_add_auth_ticket_delivery_state.ts`
- Modify: `server/models/ticket.ts`
- Modify: `server/repositories/ticket.repo.sqlite.ts`
- Modify: `server/repositories/ticket.repo.firestore.ts`
- Modify: `server/services/ticket.service.ts`
- Modify: `server/tests/query.test.ts`

**Interfaces:**
- Produces: `TicketNotificationPatch`.
- Produces: `TicketRepository.updateNotificationState(ticketId, patch): Promise<void>`.
- Consumes: existing `send(EmailPayload)` and `TicketRepository.create`.

- [ ] **Step 1: Write pairwise email-outcome tests**

Mock the shared email service at the top of `query.test.ts` without relying on a hoisted variable:

```ts
jest.mock('../services/email.service', () => ({ send: jest.fn() }));
import { send as sendEmail } from '../services/email.service';

const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;
```

Add cases that assert both calls happen even when either edge fails:

```ts
it.each([
  ['submitter fails', [new Error('submitter failed'), { delivered: true, mode: 'smtp' }]],
  ['admin fails', [{ delivered: true, mode: 'smtp' }, new Error('admin failed')]],
  ['both fail', [new Error('submitter failed'), new Error('admin failed')]],
])('persists and attempts both notifications when %s', async (_label, outcomes) => {
  for (const outcome of outcomes) {
    if (outcome instanceof Error) mockSendEmail.mockRejectedValueOnce(outcome);
    else mockSendEmail.mockResolvedValueOnce(outcome);
  }
  const res = await request(app).post('/api/query/submit').send(valid);
  expect(res.status).toBe(201);
  expect(mockSendEmail).toHaveBeenCalledTimes(2);
  expect(mockSendEmail.mock.calls[1][0].to).toBe('hello.sprout.team@gmail.com');
  const row = await db('query_tickets').where({ refNumber: res.body.refNumber }).first();
  expect(row).toMatchObject({
    submitterEmailStatus: outcomes[0] instanceof Error ? 'failed' : 'sent',
    adminEmailStatus: outcomes[1] instanceof Error ? 'failed' : 'sent',
  });
});
```

- [ ] **Step 2: Run the focused query suite and verify red**

```powershell
npm.cmd test -w server -- --runTestsByPath tests/query.test.ts
```

Expected: FAIL because current sequential `try` skips the second send and the columns/interface do not exist.

- [ ] **Step 3: Add migration and domain contract**

Migration `up` adds:

```ts
await knex.schema.alterTable('users', (t) => {
  t.integer('resetOtpFailedAttempts').notNullable().defaultTo(0);
});
await knex.schema.alterTable('query_tickets', (t) => {
  t.string('submitterEmailStatus').notNullable().defaultTo('pending');
  t.string('adminEmailStatus').notNullable().defaultTo('pending');
  t.text('lastEmailError').nullable();
  t.datetime('notificationUpdatedAt').nullable();
});
```

The `down` method drops those columns. Extend the ticket model:

```ts
export type DeliveryStatus = 'pending' | 'sent' | 'failed';

export interface TicketNotificationPatch {
  submitterEmailStatus: DeliveryStatus;
  adminEmailStatus: DeliveryStatus;
  lastEmailError: string | null;
  notificationUpdatedAt: string;
}

export interface TicketRepository {
  create(input: TicketInput): Promise<Ticket>;
  updateNotificationState(id: string, patch: TicketNotificationPatch): Promise<void>;
}
```

Both repositories update/merge the patch by ticket ID.

- [ ] **Step 4: Implement independent delivery**

Replace the coupled `try` with two concurrent, independent promises:

```ts
const adminEmail = process.env.ADMIN_EMAIL ?? 'hello.sprout.team@gmail.com';
const [submitterResult, adminResult] = await Promise.allSettled([
  sendEmail({
    to: ticket.email,
    subject: `Sprout - we received your query (${ticket.refNumber})`,
    text: `Hi ${ticket.name}, thanks for contacting Sprout. Your reference number is ${ticket.refNumber}.`,
  }),
  sendEmail({
    to: adminEmail,
    subject: `New query ticket ${ticket.refNumber} [${ticket.category}]`,
    text: `${ticket.name} <${ticket.email}>\n\n${ticket.message}`,
  }),
]);

const failures = [submitterResult, adminResult]
  .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
  .map((result) => result.reason instanceof Error ? result.reason.message : 'Unknown delivery error');

await ticketRepository.updateNotificationState(ticket.id, {
  submitterEmailStatus: submitterResult.status === 'fulfilled' ? 'sent' : 'failed',
  adminEmailStatus: adminResult.status === 'fulfilled' ? 'sent' : 'failed',
  lastEmailError: failures.length > 0 ? failures.join('; ').slice(0, 500) : null,
  notificationUpdatedAt: new Date().toISOString(),
}).catch((error: unknown) => {
  console.error(`[ticket] notification status update failed for ${ticket.refNumber}`,
    error instanceof Error ? error.message : 'Unknown persistence error');
});
```

- [ ] **Step 5: Run migration and tests**

```powershell
npm.cmd run migrate -w server
npm.cmd test -w server -- --runTestsByPath tests/query.test.ts
npm.cmd run typecheck -w server
```

Expected: migration completes, every pairwise case attempts two sends, query suite passes, and typecheck exits 0.

- [ ] **Step 6: Commit**

```powershell
git add server/database/migrations/202607200001_add_auth_ticket_delivery_state.ts server/models/ticket.ts server/repositories/ticket.repo.sqlite.ts server/repositories/ticket.repo.firestore.ts server/services/ticket.service.ts server/tests/query.test.ts
git commit -m "feat: persist independent ticket email outcomes"
```

---

### Task 3: Recoverable Signup Verification and Resend API

**Files:**
- Modify: `server/services/auth.service.ts`
- Modify: `server/controllers/auth.controller.ts`
- Modify: `server/routes/auth.routes.ts`
- Modify: `server/tests/auth.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `VerificationEmailResult { verificationEmailSent: boolean; message: string }`.
- Produces: `resendVerificationEmail(uid: string): Promise<VerificationEmailResult>`.
- Produces: `POST /api/auth/resend-verification`, protected by `unverifiedAuthMiddleware` and 3 requests/15 minutes.

- [ ] **Step 1: Replace the SMTP-dead-end test with target behavior**

Change the existing signup SMTP-failure case to assert:

```ts
expect(res.status).toBe(201);
expect(res.body.verificationEmailSent).toBe(false);
expect(await db('users').where({ email: 'smtp-failure@example.com' }).first())
  .toBeDefined();
```

Add tests for link rewriting and resend:

```ts
it('sends a Sprout-hosted Firebase action link', async () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  const res = await request(app).post('/api/auth/signup').send({
    email: 'verify@example.com', password: 'Password123!', displayName: 'Verify User',
  });
  const emailText = log.mock.calls.flat().join('\n');
  expect(res.body.verificationEmailSent).toBe(true);
  expect(emailText).toContain('http://localhost:5173/verify-email');
  expect(emailText).toContain('oobCode=');
  log.mockRestore();
});

it('resends verification for an authenticated unverified user', async () => {
  const user = await createLocalUser({ email: 'pending@example.com', isVerified: false });
  mockAuthAdmin.verifyIdToken.mockResolvedValue({
    uid: user.id, email: user.email, email_verified: false,
  });
  const res = await request(app)
    .post('/api/auth/resend-verification')
    .set('Authorization', 'Bearer pending-token');
  expect(res.status).toBe(200);
  expect(res.body.verificationEmailSent).toBe(true);
});
```

The Firebase mock link must include realistic action parameters:

```ts
generateEmailVerificationLink: jest.fn(async () =>
  'https://sprout-dev-66f08.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=test-code&apiKey=test-key'
),
```

- [ ] **Step 2: Run the auth suite and verify red**

```powershell
npm.cmd test -w server -- --runTestsByPath tests/auth.test.ts
```

Expected: FAIL on current 500 behavior, missing response field, missing rewrite, and missing route.

- [ ] **Step 3: Implement structured action-link rewriting**

Add helpers in `auth.service.ts`:

```ts
export interface VerificationEmailResult {
  verificationEmailSent: boolean;
  message: string;
}

function frontendBaseUrl(): string {
  return process.env.FRONTEND_URL ?? process.env.CORS_ORIGIN ?? 'http://localhost:5173';
}

function toSproutVerificationLink(firebaseLink: string): string {
  const source = new URL(firebaseLink);
  const target = new URL('/verify-email', frontendBaseUrl());
  source.searchParams.forEach((value, key) => target.searchParams.set(key, value));
  return target.toString();
}

async function deliverVerificationEmail(
  email: string,
  displayName: string
): Promise<VerificationEmailResult> {
  try {
    const authAdmin = await getFirebaseAuthAdmin();
    const generated = await authAdmin.generateEmailVerificationLink(email, {
      url: new URL('/verify-email', frontendBaseUrl()).toString(),
      handleCodeInApp: false,
    });
    const link = toSproutVerificationLink(generated);
    await sendEmail({
      to: email,
      subject: 'Verify your Sprout account',
      text: `Welcome to Sprout, ${displayName}!\n\nOpen this link to verify your email:\n${link}\n`,
    });
    return { verificationEmailSent: true, message: 'Check your email for the verification link.' };
  } catch (error) {
    console.error('[auth] verification email delivery failed',
      error instanceof Error ? error.message : 'Unknown email error');
    return {
      verificationEmailSent: false,
      message: 'Account created, but the verification email could not be sent. Sign in and request a new link.',
    };
  }
}
```

Call this after durable profile creation and include its result in `SignupResult`. Do not rethrow its error.

- [ ] **Step 4: Add resend service/controller/route**

Service:

```ts
export async function resendVerificationEmail(uid: string): Promise<VerificationEmailResult> {
  const authAdmin = await getFirebaseAuthAdmin();
  const firebaseUser = await authAdmin.getUser(uid);
  if (firebaseUser.emailVerified) {
    return { verificationEmailSent: false, message: 'Email is already verified.' };
  }
  if (!firebaseUser.email) throw httpError(400, 'Account has no email address.');
  const profile = await authUserRepository.getById(uid);
  return deliverVerificationEmail(
    firebaseUser.email,
    profile?.displayName ?? firebaseUser.displayName ?? 'Sprout player'
  );
}
```

Controller:

```ts
export const handleResendVerification: RequestHandler = async (req, res, next) => {
  try {
    res.status(200).json(await resendVerificationEmail(req.user!.uid));
  } catch (error) {
    next(error);
  }
};
```

Route limiter:

```ts
const verificationResendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 3,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post(
  '/resend-verification',
  verificationResendLimiter,
  unverifiedAuthMiddleware,
  handleResendVerification
);
```

Update signup validation to `max(50)` and pattern `/^[A-Za-z0-9 _-]+$/`.

- [ ] **Step 5: Run auth verification**

```powershell
npm.cmd test -w server -- --runTestsByPath tests/auth.test.ts
npm.cmd run typecheck -w server
```

Expected: signup/resend tests pass and typecheck exits 0.

- [ ] **Step 6: Commit**

```powershell
git add server/services/auth.service.ts server/controllers/auth.controller.ts server/routes/auth.routes.ts server/tests/auth.test.ts .env.example
git commit -m "feat: complete Firebase verification resend flow"
```

---

### Task 4: Sprout Verification Page and Verified Route Gate

**Files:**
- Create: `client/src/pages/VerifyEmailPage.tsx`
- Modify: `client/src/services/sproutApi.ts`
- Modify: `client/src/components/common/ProtectedRoute.tsx`
- Modify: `client/src/context/AuthContext.tsx`
- Modify: `client/src/pages/LoginPage.tsx`
- Modify: `client/src/pages/SignupPage.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/package.json`
- Modify: root `package.json`
- Modify: `client/vite.config.ts`
- Modify: root `package-lock.json`
- Delete: `client/package-lock.json`
- Create: `client/src/test/setup.ts`
- Create: `client/src/test/setup.test.ts`
- Test: `client/src/pages/VerifyEmailPage.test.tsx`
- Test: `client/src/components/common/ProtectedRoute.test.tsx`

**Interfaces:**
- Consumes: Firebase `applyActionCode(auth, oobCode)`.
- Consumes: `resendVerification(): Promise<VerificationEmailResult>`.
- Produces: `/verify-email` handling `mode=verifyEmail&oobCode=...`.
- Produces: `npm.cmd test -w client`; root `npm.cmd test` runs both workspaces.

- [ ] **Step 1: Install and configure the frontend test framework**

Run from the repository root so only the root workspace lock is updated:

```powershell
npm.cmd install -D -w client vitest@^4.1.10 jsdom@^29.1.1 @testing-library/react@^16.3.2 @testing-library/dom@^10.4.1 @testing-library/jest-dom@^6.9.1 @testing-library/user-event@^14.6.1 @vitest/coverage-v8@^4.1.10
```

Delete the tracked `client/package-lock.json`; npm workspaces use the root `package-lock.json` as the single dependency lock.

Merge into `client/vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    clearMocks: true,
  },
});
```

Create `client/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

Add `"test": "vitest run"` to the client scripts. Change the root scripts to:

```json
"test": "npm run test:server && npm run test:client",
"test:server": "npm test -w server",
"test:client": "npm test -w client"
```

- [ ] **Step 2: Prove the frontend runner works**

Create `client/src/test/setup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('frontend test environment', () => {
  it('provides a DOM', () => {
    expect(document.createElement('div')).toBeInstanceOf(HTMLElement);
  });
});
```

Run `npm.cmd test -w client`. Expected: the smoke test passes.

- [ ] **Step 3: Add failing verification and route-gate tests**

Verify these behaviors:

```tsx
it('applies a verifyEmail action code and shows success', async () => {
  renderAt('/verify-email?mode=verifyEmail&oobCode=test-code');
  expect(await screen.findByText(/email verified/i)).toBeInTheDocument();
  expect(mockApplyActionCode).toHaveBeenCalledWith(expect.anything(), 'test-code');
});

it('offers resend for an authenticated unverified user', async () => {
  renderAt('/verify-email');
  await userEvent.click(screen.getByRole('button', { name: /resend/i }));
  expect(mockResendVerification).toHaveBeenCalled();
});

it('redirects unverified gameplay access to verification', () => {
  renderProtected('/archive', 'unverified');
  expect(screen.getByText(/verify your email/i)).toBeInTheDocument();
});
```

Define `renderAt` locally in `VerifyEmailPage.test.tsx` using `MemoryRouter` and a `/verify-email` `Route`. Mock `getSproutFirebaseAuth`, `applyActionCode`, `resendVerification`, and `useAuth` with Vitest. Define `renderProtected` locally in `ProtectedRoute.test.tsx` using `MemoryRouter`, `Routes`, an `/archive` route wrapping `ProtectedRoute`, and a `/verify-email` route rendering visible verification text. Do not create an application-only provider or test-only production branch.

- [ ] **Step 4: Add typed resend client**

```ts
export interface VerificationEmailResponse {
  verificationEmailSent: boolean;
  message: string;
}

export async function resendVerification(): Promise<VerificationEmailResponse> {
  const { data } = await apiClient.post<VerificationEmailResponse>(
    '/api/auth/resend-verification'
  );
  return data;
}
```

Add `verificationEmailSent` to `SignupResponse`.

- [ ] **Step 5: Implement the verification page**

The page must use `URLSearchParams`, never string splitting:

```tsx
import { useEffect, useState } from 'react';
import { applyActionCode } from 'firebase/auth';
import { Link, useSearchParams } from 'react-router-dom';
import { getSproutFirebaseAuth } from '../services/firebaseClient';
import { resendVerification } from '../services/sproutApi';
import { useAuth } from '../hooks/useAuth';

type ViewState = 'idle' | 'applying' | 'verified' | 'invalid' | 'sending' | 'sent';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const { status, refreshProfile } = useAuth();
  const [view, setView] = useState<ViewState>('idle');
  const [message, setMessage] = useState('Verify your email to continue.');
  const mode = params.get('mode');
  const code = params.get('oobCode');

  useEffect(() => {
    if (mode !== 'verifyEmail' || !code) return;
    setView('applying');
    applyActionCode(getSproutFirebaseAuth(), code)
      .then(async () => {
        await refreshProfile();
        setView('verified');
        setMessage('Email verified. You can continue to Sprout.');
      })
      .catch(() => {
        setView('invalid');
        setMessage('This verification link is invalid or expired. Request a new link.');
      });
  }, [code, mode, refreshProfile]);

  async function handleResend() {
    setView('sending');
    try {
      const result = await resendVerification();
      setView(result.verificationEmailSent ? 'sent' : 'idle');
      setMessage(result.message);
    } catch {
      setView('idle');
      setMessage('The verification email could not be sent. Try again shortly.');
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-live="polite">
        <h1>{view === 'verified' ? 'Email verified' : 'Verify your email'}</h1>
        <p>{message}</p>
        {status === 'unverified' && view !== 'verified' && (
          <button type="button" onClick={handleResend} disabled={view === 'sending'}>
            {view === 'sending' ? 'Sending...' : 'Resend verification email'}
          </button>
        )}
        <Link to={status === 'authenticated' ? '/archive' : '/login'}>
          {status === 'authenticated' ? 'Open archive' : 'Go to login'}
        </Link>
      </section>
    </main>
  );
}
```

- [ ] **Step 6: Enforce route behavior**

`ProtectedRoute` adds:

```tsx
if (status === 'unverified') {
  return <Navigate to="/verify-email" state={{ from: location.pathname }} replace />;
}
```

`LoginPage` redirects `unverified` to `/verify-email` and only redirects `authenticated` to `from`. `App.tsx` adds the public `/verify-email` route. `SignupPage` uses `maxLength={50}` and removes all visible `EMAIL_MODE=console` instructions.

- [ ] **Step 7: Run frontend checks**

```powershell
npm.cmd test -w client -- --run client/src/pages/VerifyEmailPage.test.tsx client/src/components/common/ProtectedRoute.test.tsx
npm.cmd run lint -w client
npm.cmd run build -w client
```

Expected: focused tests, lint, and production build pass.

- [ ] **Step 8: Commit**

```powershell
git add package.json package-lock.json client/package.json client/vite.config.ts client/src/test/setup.ts client/src/test/setup.test.ts client/src/pages/VerifyEmailPage.tsx client/src/pages/VerifyEmailPage.test.tsx client/src/components/common/ProtectedRoute.tsx client/src/components/common/ProtectedRoute.test.tsx client/src/context/AuthContext.tsx client/src/pages/LoginPage.tsx client/src/pages/SignupPage.tsx client/src/services/sproutApi.ts client/src/App.tsx
git rm client/package-lock.json
git commit -m "feat: complete in-app email verification"
```

---

### Task 5: OTP Attempt Limit and Test Runtime

**Files:**
- Modify: `server/models/auth.ts`
- Modify: `server/repositories/auth-user.repo.sqlite.ts`
- Modify: `server/repositories/auth-user.repo.firestore.ts`
- Modify: `server/services/auth.service.ts`
- Modify: `server/tests/setup-env.ts`
- Modify: `server/tests/auth.test.ts`
- Uses migration: `server/database/migrations/202607200001_add_auth_ticket_delivery_state.ts`

**Interfaces:**
- Produces: `recordResetOtpFailure(id): Promise<number>`.
- Produces: `clearResetOtp(id): Promise<void>`.
- Consumes: `resetOtpFailedAttempts` with maximum 5.

- [ ] **Step 1: Add failed-attempt and duplicate-history regression tests**

```ts
it('invalidates an OTP after five wrong attempts', async () => {
  const user = await createLocalUser({ email: 'attempts@example.com' });
  const otpHash = await bcrypt.hash('123456', Number(process.env.BCRYPT_COST));
  await db('users').where({ id: user.id }).update({
    resetOtpHash: otpHash,
    resetOtpExpiresAt: new Date(Date.now() + 900_000).toISOString(),
    resetOtpFailedAttempts: 0,
  });
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const res = await request(app).post('/api/auth/verify-reset').send({
      email: user.email, otp: '000000', newPassword: 'Password123!!',
    });
    expect(res.status).toBe(400);
  }
  const row = await db('users').where({ id: user.id }).first();
  expect(row.resetOtpHash).toBeNull();
  expect(row.resetOtpFailedAttempts).toBe(0);
});

it('stores prior passwords once rather than duplicating the current hash', async () => {
  const signup = await request(app).post('/api/auth/signup').send({
    email: 'history@example.com', password: 'Password123!', displayName: 'History User',
  });
  expect(await db('password_history').where({ userId: signup.body.uid })).toHaveLength(0);
});
```

- [ ] **Step 2: Run auth suite and verify red**

```powershell
npm.cmd test -w server -- --runTestsByPath tests/auth.test.ts
```

Expected: attempt-limit/history cases fail on current implementation.

- [ ] **Step 3: Add repository operations**

Extend `AuthUserProfile` and `AuthUserRepository`:

```ts
resetOtpFailedAttempts?: number;
recordResetOtpFailure(id: string): Promise<number>;
clearResetOtp(id: string): Promise<void>;
```

SQLite performs increment/read in one transaction. Firestore uses `runTransaction`. Both clear hash, expiry, and counter when the count reaches five. `setResetOtp` always resets the counter to zero.

- [ ] **Step 4: Correct password-history semantics and bcrypt configuration**

Use:

```ts
function bcryptCost(): number {
  const configured = Number(process.env.BCRYPT_COST ?? 12);
  if (!Number.isInteger(configured) || configured < 4 || configured > 15) return 12;
  return process.env.NODE_ENV === 'test' ? configured : Math.max(12, configured);
}
```

Replace `BCRYPT_COST` uses with `bcryptCost()`. Remove initial `addPasswordHistory` from signup. History contains previous hashes; `profile.passwordHash` is checked separately and added once when reset succeeds. De-duplicate legacy hashes before comparison:

```ts
const hashes = [...new Set([
  profile.passwordHash,
  ...history.map((entry) => entry.passwordHash),
].filter((hash): hash is string => Boolean(hash)))];
```

In `verifyPasswordReset`, increment on an invalid OTP. When the returned count reaches five, return `Invalid OTP. Request a new one.` after the repository clears it.

Set in `tests/setup-env.ts`:

```ts
process.env.NODE_ENV = 'test';
process.env.BCRYPT_COST = '4';
```

Update test helper hashes to use `Number(process.env.BCRYPT_COST)`.

- [ ] **Step 5: Verify runtime and correctness**

```powershell
npm.cmd test -w server -- --runTestsByPath tests/auth.test.ts
npm.cmd test -w server
npm.cmd run typecheck -w server
```

Expected: full server suite exits 0 within Jest's default per-test timeout and produces no async database access after teardown.

- [ ] **Step 6: Commit**

```powershell
git add server/models/auth.ts server/repositories/auth-user.repo.sqlite.ts server/repositories/auth-user.repo.firestore.ts server/services/auth.service.ts server/tests/setup-env.ts server/tests/auth.test.ts
git commit -m "fix: bound reset OTP attempts and stabilize auth tests"
```

---

### Task 6: Deployment Configuration and Manual Evidence

**Files:**
- Modify: `.env.example`
- Modify: `render.yaml`
- Modify: `server/FIREBASE_SETUP.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: real secret values entered only in local `server/.env` and Render dashboard.

- [ ] **Step 1: Update non-secret defaults**

`.env.example` must contain:

```dotenv
FRONTEND_URL=http://localhost:5173
EMAIL_MODE=console
EMAIL_FROM=hello.sprout.team@gmail.com
ADMIN_EMAIL=hello.sprout.team@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=hello.sprout.team@gmail.com
SMTP_PASS=
BCRYPT_COST=12
USE_MOCK_APIS=true
PLANTID_API_KEY=
GEMINI_API_KEY=
GEMINI_IMAGE_MODEL=gemini-3.1-flash-lite-image
REMOVE_BG_API_KEY=
STORAGE_MODE=local
FIREBASE_STORAGE_BUCKET=
```

Remove the obsolete `GEMMA_API_KEY` and `FLUX_API_KEY` entries. `STORAGE_MODE=local` remains the deploy-safe fallback until Firebase Storage is activated and its bucket preflight passes.

- [ ] **Step 2: Declare Render variables without a secret value**

`render.yaml` uses:

```yaml
      - key: EMAIL_MODE
        value: smtp
      - key: EMAIL_FROM
        value: hello.sprout.team@gmail.com
      - key: ADMIN_EMAIL
        value: hello.sprout.team@gmail.com
      - key: SMTP_HOST
        value: smtp.gmail.com
      - key: SMTP_PORT
        value: "587"
      - key: SMTP_USER
        value: hello.sprout.team@gmail.com
      - key: SMTP_PASS
        sync: false
      - key: FRONTEND_URL
        sync: false
```

- [ ] **Step 3: Configure Gmail manually**

On `hello.sprout.team@gmail.com`:

1. Enable Google 2-Step Verification.
2. Open Google Account -> Security -> App passwords.
3. Create an app password named `Sprout Backend`.
4. Put the 16-character value into local `server/.env` as `SMTP_PASS` and Render's secret environment variable.
5. Do not place it in this plan, screenshots, chat, `.env.example`, or `render.yaml`.

- [ ] **Step 4: Run the live SMTP preflight**

```powershell
npm.cmd run check:email -w server
```

Expected after credentials are configured:

```text
[email-check] mode=smtp verified=true
```

Then submit one signup, one reset request, and one Contact Us ticket using controlled addresses. Capture recipient/admin inbox screenshots with OTP/action code and private addresses redacted.

- [ ] **Step 5: Configure Firebase custom-handler domains**

In Firebase Console -> Authentication -> Settings -> Authorized domains, add the deployed Vercel domain. Set Render `FRONTEND_URL` to that HTTPS origin. Confirm the generated SMTP email points to `https://<vercel-domain>/verify-email?...` and that `applyActionCode` succeeds.

- [ ] **Step 6: Commit documentation/configuration**

```powershell
git add .env.example render.yaml server/FIREBASE_SETUP.md README.md
git commit -m "docs: configure production auth email delivery"
```

---

### Task 7: Auth/Email Full Verification Gate

**Files:**
- No new production files.
- Update test/evidence notes only after commands succeed.

- [ ] **Step 1: Run all automated checks**

```powershell
npm.cmd run typecheck -w server
npm.cmd test -w server
npm.cmd test -w client
npm.cmd run lint -w client
npm.cmd run build -w client
```

Expected: every command exits 0; no timeout, post-teardown database access, or unexpected console error.

- [ ] **Step 2: Run the local browser flow**

1. Start backend and frontend.
2. Sign up with a real controlled inbox.
3. Open the Sprout `/verify-email` link.
4. Confirm archive is blocked before verification and allowed after it.
5. Request/reset password and log in with the new value.
6. Submit Contact Us and verify ticket persistence plus admin email.

Expected: UC1, UC2, UC3, and UC8 complete without terminal-only instructions.

- [ ] **Step 3: Update Checkoff evidence**

Update Obsidian test rows `AUTH-U01` through `AUTH-I02`, `TKT-U01`, `TKT-I01`, and `FE-U01` with actual result, status, commit, owner, and evidence path. Update diagrams only after the code state is frozen.

- [ ] **Step 4: Commit evidence references**

```powershell
git add docs
git commit -m "docs: record auth and email verification evidence"
```
