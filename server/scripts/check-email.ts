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
