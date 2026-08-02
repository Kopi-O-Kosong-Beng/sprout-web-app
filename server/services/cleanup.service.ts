/**
 * Firestore cleanup for the admin dashboard.
 *
 * One target so far: web uploads past their 24-hour expiry. Nothing has ever
 * deleted those — an expired TempAvatar sits in avatar_records forever, badged
 * "Expired" on the player's shelf and refused by the battle picker. Req 6.12
 * gives them a lifetime; this is what actually ends it.
 *
 * Every run is a dry run unless the caller says otherwise, and a destructive
 * run has to name the same target and re-confirm. A one-click "clean up
 * Firestore" button that deletes on first press is a bad button.
 */
import { getDb } from '../firebase';

export type CleanupTarget = 'expired-temp-avatars';

export const CLEANUP_TARGETS: readonly CleanupTarget[] = ['expired-temp-avatars'];

export interface CleanupCandidate {
  id: string;
  label: string;
  detail: string;
}

export interface CleanupReport {
  target: CleanupTarget;
  dryRun: boolean;
  /** How many documents match. Counted the same way on both paths. */
  matched: number;
  /** How many were deleted — always 0 on a dry run. */
  deleted: number;
  /** A readable sample, so an admin can see what they are about to remove. */
  sample: CleanupCandidate[];
  ranAt: string;
}

/** Firestore caps a batched write at 500 operations. */
const BATCH_LIMIT = 500;
const SAMPLE_SIZE = 20;

interface ExpiredCandidate extends CleanupCandidate {
  ref: FirebaseFirestore.DocumentReference;
}

/**
 * Expired temporary avatars.
 *
 * The filter runs in the app rather than as a Firestore query: expiresAt is
 * written as an ISO string, and a range query on it would need a composite
 * index alongside isTemporary. The collection is small enough that reading it
 * costs less than the index does to maintain — the same trade-off the avatar
 * repository already documents for listing.
 */
async function findExpiredTempAvatars(now: Date): Promise<ExpiredCandidate[]> {
  const snapshot = await getDb()
    .collection('avatar_records')
    .where('isTemporary', '==', true)
    .get();

  return snapshot.docs.flatMap((doc) => {
    const data = doc.data();
    const expiresAt =
      typeof data.expiresAt === 'string' ? Date.parse(data.expiresAt) : NaN;
    if (!Number.isFinite(expiresAt) || expiresAt > now.getTime()) return [];

    return [
      {
        ref: doc.ref,
        id: doc.id,
        label:
          typeof data.speciesName === 'string' ? data.speciesName : '(unnamed species)',
        detail: `expired ${data.expiresAt}`,
      },
    ];
  });
}

async function deleteAll(
  refs: FirebaseFirestore.DocumentReference[]
): Promise<number> {
  const db = getDb();
  let deleted = 0;

  for (let start = 0; start < refs.length; start += BATCH_LIMIT) {
    const batch = db.batch();
    const slice = refs.slice(start, start + BATCH_LIMIT);
    slice.forEach((ref) => batch.delete(ref));
    await batch.commit();
    deleted += slice.length;
  }

  return deleted;
}

/** Runs a cleanup target. `dryRun: true` reports without deleting anything. */
export async function runCleanup(
  target: CleanupTarget,
  options: { dryRun: boolean; now?: Date }
): Promise<CleanupReport> {
  const now = options.now ?? new Date();
  const candidates = await findExpiredTempAvatars(now);

  return {
    target,
    dryRun: options.dryRun,
    matched: candidates.length,
    deleted: options.dryRun
      ? 0
      : await deleteAll(candidates.map((candidate) => candidate.ref)),
    sample: candidates.slice(0, SAMPLE_SIZE).map(({ id, label, detail }) => ({
      id,
      label,
      detail,
    })),
    ranAt: now.toISOString(),
  };
}
