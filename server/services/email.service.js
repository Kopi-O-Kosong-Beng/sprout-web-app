/** Email delivery — tasks.md 3.3. EMAIL_MODE=console (dev) logs instead of sending,
 *  so demos and tests never depend on an SMTP account. */
const send = async ({ to, subject, text }) => {
  const mode = process.env.EMAIL_MODE || 'console';
  if (mode === 'console') {
    console.log(`[email] to=${to} subject="${subject}"\n${text}\n`);
    return { delivered: true, mode };
  }
  // TODO(Task 3.3): nodemailer SMTP transport once EMAIL_MODE=smtp is configured
  throw new Error('SMTP transport not configured — set EMAIL_MODE=console for dev');
};

module.exports = { send };
