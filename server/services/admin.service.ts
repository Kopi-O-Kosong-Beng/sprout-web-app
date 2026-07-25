/** Admin account management: list Sprout accounts and delete one.
 *
 *  Exists so the team can clear test accounts between demo runs — deleting an
 *  account frees its email address for re-registration, which is what makes a
 *  repeatable signup/OTP walkthrough possible.
 */
import { getAuthAdmin, getDb } from '../firebase';
import authUserRepository from '../repositories/auth-users';
import { isAdminEmail } from '../middleware/admin.middleware';

export interface AdminAccountSummary {
  id: string;
  email: string;
  displayName: string;
  isVerified: boolean;
  isAdmin: boolean;
  pveXp: number;
  pveWins: number;
  pveLosses: number;
  createdAt: string | null;
  lastLogin: string | null;
}

export interface DeleteAccountResult {
  id: string;
  firebaseIdentityDeleted: boolean;
  profileDeleted: boolean;
}

export class AdminOperationError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'AdminOperationError';
  }
}

/** Newest first, so the accounts a demo just created are at the top. */
export async function listAccounts(): Promise<AdminAccountSummary[]> {
  const snapshot = await getDb().collection('users').get();
  return snapshot.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const email = typeof data.email === 'string' ? data.email : '';
      return {
        id: doc.id,
        email,
        displayName: typeof data.displayName === 'string' ? data.displayName : '',
        isVerified: data.isVerified === true,
        isAdmin: isAdminEmail(email),
        pveXp: Number(data.pveXp ?? 0),
        pveWins: Number(data.pveWins ?? 0),
        pveLosses: Number(data.pveLosses ?? 0),
        createdAt: typeof data.createdAt === 'string' ? data.createdAt : null,
        lastLogin: typeof data.lastLogin === 'string' ? data.lastLogin : null,
      };
    })
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

/** Deletes the Firebase identity and the Sprout profile.
 *
 *  Firebase is deleted first: the identity is what blocks re-registration of
 *  the email, so if the second step fails the operator can retry rather than
 *  being left with a login that has no profile. A Firebase user that is
 *  already gone is treated as success so a retry can finish the job.
 */
export async function deleteAccount(
  targetUid: string,
  requesterUid: string
): Promise<DeleteAccountResult> {
  if (targetUid === requesterUid) {
    throw new AdminOperationError(400, 'You cannot delete your own admin account.');
  }

  const profile = await authUserRepository.getById(targetUid);
  let firebaseIdentityDeleted = false;
  try {
    await getAuthAdmin().deleteUser(targetUid);
    firebaseIdentityDeleted = true;
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === 'auth/user-not-found') {
      firebaseIdentityDeleted = false;
    } else {
      throw new AdminOperationError(502, 'Could not delete the Firebase identity.');
    }
  }

  let profileDeleted = false;
  if (profile) {
    await getDb().collection('users').doc(targetUid).delete();
    profileDeleted = true;
  }

  if (!firebaseIdentityDeleted && !profileDeleted) {
    throw new AdminOperationError(404, 'Account not found.');
  }

  return { id: targetUid, firebaseIdentityDeleted, profileDeleted };
}
