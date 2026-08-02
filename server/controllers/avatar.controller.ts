/** Avatar archive controller — Req 5, tasks.md 5.1/5.2 */
import type { RequestHandler } from 'express';
import { isAvatarBattleEligible } from '../data/battle-eligibility';
import type { AvatarRecord, PaginatedAvatars } from '../models/avatar';
import avatarRepository from '../repositories/avatars';
import { getDb } from '../firebase';
import { sanitizeSpeciesKey } from '../pipeline/dex';
import dexRepository from '../repositories/dex';

const DEFAULT_PAGE_SIZE = 20;

interface PublicAvatarRecord extends AvatarRecord {
  battleEligible: boolean;
}

interface AvatarDiscovery {
  firstDiscoveredByName: string;
  firstDiscoveredAt: string;
  discoveryCount: number;
  isFirstDiscoverer: boolean;
}

/** Resolves who found this species first. Degrades to null rather than failing
 *  the detail request — the discoverer is a nice-to-have, the avatar is not.
 *  Only the display name is exposed; the email never leaves the server. */
async function resolveDiscovery(
  speciesName: string,
  callerUid: string
): Promise<AvatarDiscovery | null> {
  try {
    const speciesKey = sanitizeSpeciesKey(speciesName);
    if (!speciesKey) return null;

    const dex = await dexRepository.get(speciesKey);
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
    // Still degrade to null — the avatar must render either way. But log it, or
    // a Firestore misconfiguration is indistinguishable from "nobody has found
    // this species yet" and stays invisible forever.
    console.error(
      'Discovery lookup failed:',
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

interface PublicPaginatedAvatars
  extends Omit<PaginatedAvatars, 'items'> {
  items: PublicAvatarRecord[];
}

function serializeAvatar(
  avatar: AvatarRecord,
  now: Date
): PublicAvatarRecord {
  return {
    ...avatar,
    battleEligible: isAvatarBattleEligible(avatar, now),
  };
}

function serializePage(
  page: PaginatedAvatars,
  now: Date
): PublicPaginatedAvatars {
  return {
    ...page,
    items: page.items.map((avatar) => serializeAvatar(avatar, now)),
  };
}

export const handleListAvatars: RequestHandler = async (req, res, next) => {
  try {
    const userId = req.user!.uid;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number(req.query.pageSize) || DEFAULT_PAGE_SIZE)
    );
    const result = await avatarRepository.listByUser(userId, page, pageSize);
    res.status(200).json(serializePage(result, new Date()));
  } catch (err) {
    next(err);
  }
};

export const handleGetAvatar: RequestHandler = async (req, res, next) => {
  try {
    const userId = req.user!.uid;
    const avatar = await avatarRepository.getOwned(userId, req.params.avatarId);
    if (!avatar) {
      res.status(404).json({ error: 'Avatar not found.' });
      return;
    }
    const discovery = await resolveDiscovery(avatar.speciesName, userId);
    res.status(200).json({ ...serializeAvatar(avatar, new Date()), discovery });
  } catch (err) {
    next(err);
  }
};

export const handleEnableDemoAvatars: RequestHandler = async (req, res, next) => {
  try {
    const result = await avatarRepository.ensureDemoSet(req.user!.uid);
    res.status(200).json(serializePage(result, new Date()));
  } catch (err) {
    next(err);
  }
};

export const handleDisableDemoAvatars: RequestHandler = async (req, res, next) => {
  try {
    const result = await avatarRepository.removeDemoSet(req.user!.uid);
    res.status(200).json(serializePage(result, new Date()));
  } catch (err) {
    next(err);
  }
};
