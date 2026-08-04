/** Avatar archive controller — Req 5, tasks.md 5.1/5.2 */
import type { RequestHandler } from 'express';
import { isAvatarBattleEligible } from '../data/battle-eligibility';
import type { AvatarRecord, PaginatedAvatars } from '../models/avatar';
import avatarRepository from '../repositories/avatars';
// Shared with the scan pipeline: one implementation resolves the discoverer's
// UID to a display name, so the avatar detail and the scan `complete` event
// cannot disagree about the block's shape.
import { resolveDiscoveryForSpecies } from '../services/discovery';

const DEFAULT_PAGE_SIZE = 20;

interface PublicAvatarRecord extends AvatarRecord {
  battleEligible: boolean;
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
    const discovery = await resolveDiscoveryForSpecies(avatar.speciesName, userId);
    res.status(200).json({ ...serializeAvatar(avatar, new Date()), discovery });
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/avatar/:avatarId — the archive's shovel. Ownership is checked
 *  in the repository, so someone else's id answers the same 404 as a missing
 *  one and the route confirms nothing about other players' records. */
export const handleDeleteAvatar: RequestHandler = async (req, res, next) => {
  try {
    const deleted = await avatarRepository.deleteOwned(
      req.user!.uid,
      req.params.avatarId
    );
    if (!deleted) {
      res.status(404).json({ error: 'Avatar not found.' });
      return;
    }
    res.status(204).end();
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
