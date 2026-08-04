/** Email delivery — tasks.md 3.3. Three interchangeable modes behind one
 *  `send()` contract:
 *
 *  - EMAIL_MODE=console (dev/tests) logs instead of sending, so demos and
 *    tests never depend on a mail account.
 *  - EMAIL_MODE=smtp delivers through Nodemailer — for Gmail, SMTP_PASS must
 *    be a Google App Password on the team account (see .env.example), never
 *    the normal account password.
 *  - EMAIL_MODE=resend delivers over HTTPS through the Resend API. Required
 *    on hosts that block outbound SMTP ports (Render's free tier hangs on
 *    port 587 until the request times out), because 443 stays open.
 *
 *  Every mode resolves to the same EmailResult, so callers — signup
 *  verification, reset OTP, ticket notifications — never branch on transport.
 */
import nodemailer, { type Transporter } from 'nodemailer';

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
}

export interface EmailResult {
  delivered: boolean;
  mode: string;
}

export interface EmailTransportStatus {
  mode: string;
  verified: boolean;
}

export class MissingEmailEnvironmentError extends Error {
  readonly code = 'missing_email_environment';

  constructor(name: string, mode = 'smtp') {
    super(`Missing required email env var: ${name} (required when EMAIL_MODE=${mode})`);
    this.name = 'MissingEmailEnvironmentError';
  }
}

/** Provider rejection (non-2xx). The message never carries the API key, and
 *  the provider body is truncated so a verbose error cannot leak recipient
 *  content into logs. */
export class EmailProviderError extends Error {
  readonly code = 'email_provider_error';

  constructor(status: number, detail: string) {
    super(`Resend API request failed (HTTP ${status}): ${detail}`);
    this.name = 'EmailProviderError';
  }
}

function requireEnv(name: string, mode = 'smtp'): string {
  const value = process.env[name];
  if (!value) {
    throw new MissingEmailEnvironmentError(name, mode);
  }
  return value;
}

/** Resend requires a verified sender. Until a custom domain is verified,
 *  `onboarding@resend.dev` is the allowed from-address. */
const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const RESEND_TIMEOUT_MS = 10_000;

function resendFromAddress(): string {
  return process.env.RESEND_FROM ?? process.env.EMAIL_FROM ?? 'onboarding@resend.dev';
}

async function sendViaResend({ to, subject, text }: EmailPayload): Promise<void> {
  const apiKey = requireEnv('RESEND_API_KEY', 'resend');

  // Never let a stalled provider hold a user request open the way blocked
  // SMTP did; callers treat a throw as "not delivered" and carry on.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), RESEND_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: resendFromAddress(), to: [to], subject, text }),
      signal: abort.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 200);
    throw new EmailProviderError(response.status, detail);
  }
}

let smtpTransporter: Transporter | null = null;

function getSmtpTransporter(): Transporter {
  if (!smtpTransporter) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    smtpTransporter = nodemailer.createTransport({
      host: requireEnv('SMTP_HOST'),
      port,
      secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
      auth: {
        user: requireEnv('SMTP_USER'),
        pass: requireEnv('SMTP_PASS'),
      },
      // Hosts that block outbound SMTP (Render's free tier, some campus
      // networks) drop packets rather than refuse the connection, which left
      // a signup request hanging for minutes and surfacing as an unexplained
      // failure. Bounded waits turn "hangs forever" into "fails in seconds
      // with ETIMEDOUT in the log" — the caller already treats a throw as
      // not-delivered.
      connectionTimeout: 8_000,
      greetingTimeout: 8_000,
      socketTimeout: 15_000,
    });
  }
  return smtpTransporter;
}

export async function verifyEmailTransport(): Promise<EmailTransportStatus> {
  const mode = process.env.EMAIL_MODE ?? 'console';
  if (mode === 'console') return { mode, verified: true };
  if (mode === 'resend') {
    // Presence check only: sending a probe email on every check would cost
    // quota and mail a real inbox.
    requireEnv('RESEND_API_KEY', 'resend');
    return { mode, verified: true };
  }
  if (mode !== 'smtp') throw new Error(`Unsupported EMAIL_MODE: ${mode}`);
  await getSmtpTransporter().verify();
  return { mode, verified: true };
}

export async function send({ to, subject, text }: EmailPayload): Promise<EmailResult> {
  const mode = process.env.EMAIL_MODE ?? 'console';

  if (mode === 'console') {
    console.log(`[email] mode=console delivered=true to=${to} subject="${subject}"`);
    return { delivered: true, mode };
  }

  if (mode === 'smtp') {
    await getSmtpTransporter().sendMail({
      from: process.env.EMAIL_FROM ?? requireEnv('SMTP_USER'),
      to,
      subject,
      text,
    });
    return { delivered: true, mode };
  }

  if (mode === 'resend') {
    await sendViaResend({ to, subject, text });
    return { delivered: true, mode };
  }

  throw new Error(`Unsupported EMAIL_MODE: ${mode}`);
}
