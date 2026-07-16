/** Email delivery — tasks.md 3.3. EMAIL_MODE=console (dev/tests) logs instead
 *  of sending, so demos and tests never depend on an SMTP account.
 *  EMAIL_MODE=smtp delivers through Nodemailer — for Gmail, SMTP_PASS must be
 *  a Google App Password on the team account (see .env.example), never the
 *  normal account password. */
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

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required email env var: ${name} (required when EMAIL_MODE=smtp)`);
  }
  return value;
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
    });
  }
  return smtpTransporter;
}

export async function send({ to, subject, text }: EmailPayload): Promise<EmailResult> {
  const mode = process.env.EMAIL_MODE ?? 'console';

  if (mode === 'console') {
    console.log(`[email] to=${to} subject="${subject}"\n${text}\n`);
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

  throw new Error(`Unsupported EMAIL_MODE: ${mode}`);
}
