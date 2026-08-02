/** First-discoverer resolution — spec 2026-08-02 section E.
 *
 *  The dex stores `firstDiscoveredBy` as a Firebase UID. That UID must never
 *  reach a browser: it identifies another account, and section E promises the
 *  wire block carries a display name and nothing else identifying. This module
 *  is the single place that turns a stored dex record into the block clients
 *  actually read, so the avatar-detail endpoint and the scan pipeline cannot
 *  drift apart the way they did (the scan `complete` event used to ship the raw
 *  dex record, whose field names no client has ever read).
 *
 *  Only `displayName` is exposed — never the email. Every failure degrades to
 *  null rather than propagating: the discoverer is a nice-to-have, the avatar
 *  and the saved scan are not. Failures are logged first, or a Firestore
 *  misconfiguration is indistinguishable from "nobody has found this species
 *  yet" and stays invisible forever.
 */
import { getDb } from '../firebase';
import type { DexDiscovery } from '../models/dex';
import { sanitizeSpeciesKey } from '../pipeline/dex';
import dexRepository from '../repositories/dex';

/** The discovery block as it appears on the wire. No UID, no email. */
export interface PublicDiscovery {
  firstDiscoveredByName: string;
  firstDiscoveredAt: string;
  discoveryCount: number;
  isFirstDiscoverer: boolean;
}

/** Signature both call sites depend on, so tests can substitute a fake. */
export type DiscoveryResolver = (
  dex: DexDiscovery | null,
  callerUid: string
) => Promise<PublicDiscovery | null>;

function logFailure(error: unknown): null {
  console.error(
    'Discovery lookup failed:',
    error instanceof Error ? error.message : String(error)
  );
  return null;
}

/** Resolves a dex record already in hand into its public form. */
export const resolveDiscovery: DiscoveryResolver = async (dex, callerUid) => {
  try {
    if (!dex || !dex.firstDiscoveredBy) return null;

    const snapshot = await getDb().collection('users').doc(dex.firstDiscoveredBy).get();
    const displayName = snapshot.exists ? snapshot.data()?.displayName : undefined;
    if (typeof displayName !== 'string' || !displayName.trim()) return null;

    return {
      firstDiscoveredByName: displayName,
      firstDiscoveredAt: dex.firstDiscoveredAt,
      discoveryCount: dex.discoveryCount,
      isFirstDiscoverer: dex.firstDiscoveredBy === callerUid,
    };
  } catch (error) {
    return logFailure(error);
  }
};

/** Looks the species up first — the avatar-detail path, which holds a name. */
export async function resolveDiscoveryForSpecies(
  speciesName: string,
  callerUid: string
): Promise<PublicDiscovery | null> {
  try {
    const speciesKey = sanitizeSpeciesKey(speciesName);
    if (!speciesKey) return null;
    return await resolveDiscovery(await dexRepository.get(speciesKey), callerUid);
  } catch (error) {
    return logFailure(error);
  }
}
