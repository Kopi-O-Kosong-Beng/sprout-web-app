/** Creates (or repairs) an admin account that can reach the /admin dashboard.
 *
 *  Run: npm run seed:admin -w server
 *
 *  Credentials come from argv, then env, so the password never lands in git:
 *    npm run seed:admin -w server -- sprout@gmail.com 'the-password'
 *    SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... npm run seed:admin -w server
 *
 *  The account is written to BOTH halves of the auth story, because each one
 *  answers a different question at runtime: Firebase Auth owns the password and
 *  the email_verified claim the ID token carries, while the Firestore `users`
 *  document is what /api/auth/me returns and what the password-reset flow reads.
 *  A user in only one of them logs in but has no profile, or has a profile it
 *  can never sign in to.
 *
 *  emailVerified is forced true: every /api endpoint requires a verified token,
 *  and waiting on a link delivered to a shared team inbox would block the
 *  dashboard on somebody else's mail client.
 *
 *  Re-running is safe. An existing account keeps its uid, its PVE stats and its
 *  history — only the password and the verified flag are reasserted, so this
 *  doubles as "the admin locked themselves out" recovery.
 *
 *  Privilege is opt-in, via `--superadmin`:
 *    npm run seed:admin -w server -- sprout@gmail.com 'the-password' --superadmin
 *
 *  Without that flag the script grants nothing and only reports on the grants
 *  the account already has. It still never edits ADMIN_EMAILS — the break-glass
 *  allowlist is deployment config, and a script that silently widened who can
 *  delete accounts would be a poor thing to have in a repo.
 */
import '../env';
import bcrypt from 'bcrypt';
import authUserRepository from '../repositories/auth-users';
import { isAdminEmail, isSuperAdminEmail } from '../middleware/admin.middleware';
import {
  isStrongPassword,
  PASSWORD_POLICY_MESSAGE,
} from '../services/password-policy';
import { getAuthAdmin } from '../firebase';

const DEFAULT_EMAIL = 'sprout@gmail.com';
const DEFAULT_DISPLAY_NAME = 'Sprout Admin';
const BCRYPT_COST = 12;
const PASSWORD_HISTORY_KEEP = 3;

interface SeedInput {
  email: string;
  password: string;
  displayName: string;
  /** `--superadmin` sets isSuperAdmin on the profile. Opt-in rather than the
   *  default: this script doubles as password recovery for an ordinary
   *  account, and re-running it should never quietly hand out the console. */
  superAdmin: boolean;
}

export function resolveSeedInput(
  argv: string[],
  env: NodeJS.ProcessEnv
): SeedInput {
  const superAdmin =
    argv.includes('--superadmin') || env.SEED_ADMIN_SUPERADMIN === 'true';
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const [emailArg, passwordArg, displayNameArg] = positional;
  const email = (emailArg ?? env.SEED_ADMIN_EMAIL ?? DEFAULT_EMAIL)
    .trim()
    .toLowerCase();
  const password = passwordArg ?? env.SEED_ADMIN_PASSWORD ?? '';
  const displayName = (
    displayNameArg ??
    env.SEED_ADMIN_DISPLAY_NAME ??
    DEFAULT_DISPLAY_NAME
  ).trim();

  if (!password) {
    throw new Error(
      'No password supplied. Pass it as the second argument or set SEED_ADMIN_PASSWORD in server/.env:\n' +
        "  npm run seed:admin -w server -- sprout@gmail.com 'your-password'"
    );
  }
  // The same rule signup enforces. A seeded account that could not have been
  // created through the UI would be a silent hole in the password policy —
  // which is why this now shares services/password-policy with
  // assertStrongPassword instead of restating the regexes and hoping.
  if (!isStrongPassword(password)) {
    throw new Error(PASSWORD_POLICY_MESSAGE);
  }
  if (!/^[A-Za-z0-9 _-]{1,50}$/.test(displayName)) {
    throw new Error(
      'Display name must be 1-50 characters of letters, numbers, spaces, underscores, or hyphens.'
    );
  }

  return { email, password, displayName, superAdmin };
}

function isUserNotFound(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? (err as { code?: unknown }).code
      : undefined;
  return code === 'auth/user-not-found';
}

async function upsertFirebaseUser(input: SeedInput): Promise<string> {
  const auth = getAuthAdmin();
  try {
    const existing = await auth.getUserByEmail(input.email);
    await auth.updateUser(existing.uid, {
      password: input.password,
      emailVerified: true,
    });
    return existing.uid;
  } catch (err) {
    if (!isUserNotFound(err)) throw err;
    const created = await auth.createUser({
      email: input.email,
      password: input.password,
      displayName: input.displayName,
      emailVerified: true,
    });
    return created.uid;
  }
}

async function upsertSproutProfile(
  uid: string,
  input: SeedInput,
  passwordHash: string
): Promise<'created' | 'updated'> {
  const existing = await authUserRepository.getById(uid);
  if (existing) {
    await authUserRepository.updatePassword(uid, passwordHash);
    if (!existing.isVerified) await authUserRepository.markVerified(uid);
    return 'updated';
  }

  // Signup rejects a duplicate display name with 409; seeding past that check
  // would create exactly the collision the UI refuses to make.
  const nameOwner = await authUserRepository.getByDisplayName(input.displayName);
  if (nameOwner && nameOwner.id !== uid) {
    throw new Error(
      `Display name "${input.displayName}" already belongs to ${nameOwner.email}. ` +
        'Pass a different one as the third argument.'
    );
  }

  await authUserRepository.createProfile({
    id: uid,
    email: input.email,
    displayName: input.displayName,
    isVerified: true,
    passwordHash,
  });
  return 'created';
}

async function run(): Promise<void> {
  const input = resolveSeedInput(process.argv.slice(2), process.env);
  const uid = await upsertFirebaseUser(input);
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  const outcome = await upsertSproutProfile(uid, input, passwordHash);

  // Keeps the reset flow's "no reusing your last 3 passwords" honest for this
  // account too.
  await authUserRepository.addPasswordHistory(uid, passwordHash);
  await authUserRepository.prunePasswordHistory(uid, PASSWORD_HISTORY_KEEP);

  console.log(
    `Admin account ${outcome}: ${input.email} (uid ${uid}), email verified, display name "${input.displayName}".`
  );

  if (input.superAdmin) {
    await authUserRepository.setSuperAdmin(uid, true);
    console.log(
      'Superadmin flag set — Studio, API Test, Ticket Manager and Admin will open.'
    );
    return;
  }

  if (isSuperAdminEmail(input.email)) {
    console.log(
      'SUPER_ADMIN_EMAILS lists this address, so the operator tools open via\n' +
        'the break-glass allowlist even without the flag.'
    );
    return;
  }

  if (isAdminEmail(input.email)) {
    console.warn(
      '\nNOTE: this address is in ADMIN_EMAILS, which is advisory only and opens\n' +
        'no operator surface on its own.'
    );
  }

  console.warn(
    '\nWARNING: this account has NO superadmin grant, so /api/admin will answer 403\n' +
      'and the dashboard will stay empty. Both grants fail closed by design.\n' +
      'Give it one of:\n\n' +
      `  npm run seed:admin -w server -- ${input.email} '<password>' --superadmin\n` +
      `  SUPER_ADMIN_EMAILS=${input.email}   (server/.env + deploy env, then restart)\n`
  );
}

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error(
        `Admin seed failed: ${err instanceof Error ? err.message : String(err)}`
      );
      process.exit(1);
    });
}
