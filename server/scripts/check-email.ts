import '../env';
import {
  MissingEmailEnvironmentError,
  verifyEmailTransport,
} from '../services/email.service';

interface EmailCheckOptions {
  verify?: typeof verifyEmailTransport;
  log?: (message: string) => void;
  error?: (message: string) => void;
}

export async function runEmailCheck(options: EmailCheckOptions = {}): Promise<number> {
  const verify = options.verify ?? verifyEmailTransport;
  const log = options.log ?? console.log;
  const errorLog = options.error ?? console.error;

  try {
    const result = await verify();
    log(`[email-check] mode=${result.mode} verified=${result.verified}`);
    return 0;
  } catch (error: unknown) {
    const reason = error instanceof MissingEmailEnvironmentError
      ? error.message
      : 'transport_verification_failed';
    errorLog(`[email-check] failed: ${reason}`);
    return 1;
  }
}

if (require.main === module) {
  void runEmailCheck().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
