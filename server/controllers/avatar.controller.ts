/** Avatar archive controller — Req 5, tasks.md 5.1/5.2 */
import type { RequestHandler } from 'express';
import { isAvatarBattleEligible } from '../data/battle-eligibility';
import { retentionForSource, type CaptureSource } from '../data/capture-source';
import type { AvatarRecord, PaginatedAvatars } from '../models/avatar';
import avatarRepository from '../repositories/avatars';
import { recordScanDiscovery } from '../services/almanac.service';
import { deriveAvatarStats } from '../services/avatar-stats';

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
    res.status(200).json(serializeAvatar(avatar, new Date()));
  } catch (err) {
    next(err);
  }
};

/* The scan's metadata has been through the route's Joi schema, so these only
 * narrow what the schema already allows — they are not validation. */
function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function asStringMap(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  );
}

/** Body of POST /api/avatar, after the route's Joi schema has run. */
interface CreateAvatarBody {
  speciesName: string;
  speciesFamily?: string | null;
  spriteDataUrl: string;
  photoDataUrl?: string;
  source: CaptureSource;
  metadata?: Record<string, unknown>;
}

export const handleCreateAvatar: RequestHandler = async (req, res, next) => {
  try {
    const body = req.body as CreateAvatarBody;
    const speciesFamily = body.speciesFamily?.trim() || null;
    const now = new Date();

    const avatar = await avatarRepository.createForUser(
      req.user!.uid,
      {
        speciesName: body.speciesName,
        speciesFamily,
        // The sprite travels with the record. There is no object store wired up
        // (FIREBASE_STORAGE_BUCKET is unset), and a finished 192x192 Spica72
        // PNG is tens of kilobytes — comfortably inside Firestore's 1 MB
        // document ceiling, which the route's schema enforces up front.
        spriteUrl: body.spriteDataUrl,
        source: body.source,
        // An IRL scan is kept; a web upload expires in 24h. One rule, in
        // data/capture-source.ts, so the label and the lifetime cannot disagree.
        ...retentionForSource(body.source, now),
        stats: deriveAvatarStats(body.speciesName, speciesFamily),
        metadata: {
          ...(body.metadata ?? {}),
          displayName: body.speciesName,
          capturedVia: 'scan',
          // The photo the sprite was drawn from, same slot the demo plants use,
          // so the specimen card shows a real scan's original too.
          ...(body.photoDataUrl ? { photoUrl: body.photoDataUrl } : {}),
        },
      },
      now
    );

    // The almanac is a side effect of collecting, not a condition of it. The
    // archive write has already committed here, so a failure to tally the
    // discovery is logged and swallowed — losing a count is not worth telling
    // a player their plant was not saved when it was.
    let discovery: Awaited<ReturnType<typeof recordScanDiscovery>> = null;
    try {
      const scanMetadata = body.metadata ?? {};
      discovery = await recordScanDiscovery({
        speciesName: avatar.speciesName,
        userId: avatar.userId,
        avatarId: avatar.id,
        photoUrl: body.photoDataUrl ?? null,
        discoveredAt: avatar.discoveredAt,
        // Snapshotted onto the discovery so the almanac can show the creature
        // and its record without ever reading this player's avatar document.
        spriteUrl: avatar.spriteUrl,
        stats: avatar.stats,
        description: asString(scanMetadata.description),
        commonNames: asStringArray(scanMetadata.commonNames),
        taxonomy: asStringMap(scanMetadata.taxonomy),
        confidence:
          typeof scanMetadata.confidence === 'number' ? scanMetadata.confidence : null,
      });
    } catch (err) {
      console.error('[almanac] discovery not recorded:', err);
    }

    res.status(201).json({
      ...serializeAvatar(avatar, now),
      // Present only when the species is one of the almanac's 200, so the Scan
      // screen can say "first discovery" without asking a second question.
      almanac: discovery
        ? {
            speciesId: discovery.species.id,
            commonName: discovery.species.commonName,
            firstDiscovery: discovery.firstDiscovery,
          }
        : null,
    });
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
