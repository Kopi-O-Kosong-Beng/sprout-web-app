/** Avatar archive controller — Req 5, tasks.md 5.1/5.2 */
import type { RequestHandler } from 'express';
import { isAvatarBattleEligible } from '../data/battle-eligibility';
import type { AvatarRecord, PaginatedAvatars } from '../models/avatar';
import avatarRepository from '../repositories/avatars';
import dexRepository from '../repositories/dex';
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

/**
 * The species key is embedded in the canonical sprite object's path
 * (`.../o/sprites%2F<speciesKey>%2Fv1.png?...`). Reading it back from the
 * stored url is how the archive maps a player's record to its dex entry
 * without storing the key on every record — and it is exact, so an
 * unidentified scan's user-scoped key never collides with a real species that
 * merely shares a name. Returns null for anything that is not a stored sprite
 * (a data-url photo crop, a seeded demo asset under /plants/).
 */
const SPRITE_KEY_RE = /\/o\/sprites%2F([a-z0-9_]+)%2Fv\d+\.png/i;

function speciesKeyFromSpriteUrl(spriteUrl: string): string | null {
  const match = SPRITE_KEY_RE.exec(spriteUrl);
  return match ? match[1] : null;
}

/**
 * Overlays the currently-published dex sprite onto each record.
 *
 * A record stores whatever sprite was canonical when it was scanned; when a
 * superadmin publishes a different candidate in the dex gate, the global
 * reference (`dex.spriteUrl`) moves but the player's stored url does not.
 * Rather than rewrite every owner's records on publish — which is the
 * expensive fan-out the whole gate model avoids — the archive resolves the
 * live reference on read, in one batched dex fetch per page. A record whose
 * species has no dex entry (or whose sprite is not a stored object) keeps its
 * own url.
 */
async function overlayPublishedSprites(
  items: AvatarRecord[]
): Promise<AvatarRecord[]> {
  const keys = items.map((item) => speciesKeyFromSpriteUrl(item.spriteUrl));
  const published = await dexRepository.getSpriteUrls(
    keys.filter((key): key is string => key !== null)
  );
  if (published.size === 0) return items;

  return items.map((item, index) => {
    const key = keys[index];
    const url = key ? published.get(key) : undefined;
    return url && url !== item.spriteUrl ? { ...item, spriteUrl: url } : item;
  });
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
    const items = await overlayPublishedSprites(result.items);
    res.status(200).json(serializePage({ ...result, items }, new Date()));
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
    const [overlaid] = await overlayPublishedSprites([avatar]);
    const discovery = await resolveDiscoveryForSpecies(avatar.speciesName, userId);
    res.status(200).json({ ...serializeAvatar(overlaid, new Date()), discovery });
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
