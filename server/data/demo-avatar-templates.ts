/** Deterministic demo catalogue used by Firestore seed tooling.
 *
 *  DEMO_USER_ID is a fixed, well-known id. With AUTH_DEV_BYPASS=true the
 *  frontend can act as this user by sending header `x-dev-uid: demo-user-0001`
 *  and immediately see these avatars — no Firebase login needed yet.
 */
import { createHash } from 'crypto';
import type { AvatarStats } from '../models/avatar';
import { retentionForSource, type CaptureSource } from './capture-source';
import { plantAssetUrl } from './sprite-catalog';

export const DEMO_USER_ID = 'demo-user-0001';
export const DEMO_EMAIL = 'demo@sprout.app';
export const DEMO_SET_VERSION = 'checkoff3-v1';

export function demoAvatarId(userId: string, templateId: string): string {
  return createHash('sha256')
    .update(`${DEMO_SET_VERSION}:${userId}:${templateId}`)
    .digest('hex')
    .slice(0, 32);
}

export interface DemoAvatarTemplate {
  id: string;
  speciesName: string;
  speciesFamily: string;
  /** 'mobile' is an IRL scan and is kept; 'web' is an upload and expires in 24h.
   *  Retention follows from this — see data/capture-source.ts. */
  source: CaptureSource;
  stats: AvatarStats;
  /**
   * The hand-made art, as filenames in `client/public/plants/`: the creature
   * that stands in the pot, and the photograph it was drawn from, which the
   * specimen card shows beside it. Change these strings if the files you drop
   * in use a different extension — they are matched exactly, not guessed at.
   */
  spriteFile: string;
  photoFile: string;
  metadata: Record<string, unknown>;
}

export const DEMO_AVATAR_TEMPLATES: DemoAvatarTemplate[] = [
  {
    id: 'demo-avatar-helianthus-annuus',
    speciesName: 'Helianthus annuus',
    speciesFamily: 'Asteraceae',
    source: 'mobile',
    spriteFile: 'SPRITE_Helianthus.png',
    photoFile: 'IMG_Helianthus.jpg',
    stats: { hp: 96, attack: 72, defense: 41, speed: 68 },
    metadata: {
      taxonomy: 'flower',
      confidence: 0.97,
      locality: { city: 'Singapore', venue: 'Gardens by the Bay' },
    },
  },
  {
    id: 'demo-avatar-quercus-robur',
    speciesName: 'Quercus robur',
    speciesFamily: 'Fagaceae',
    source: 'mobile',
    spriteFile: 'SPRITE_Quercus.png',
    photoFile: 'IMG_Quercus.jpg',
    stats: { hp: 168, attack: 44, defense: 88, speed: 22 },
    metadata: {
      taxonomy: 'tree',
      confidence: 0.93,
      locality: { city: 'Singapore', venue: 'Botanic Gardens' },
    },
  },
  {
    id: 'demo-avatar-monstera-deliciosa',
    speciesName: 'Monstera deliciosa',
    speciesFamily: 'Araceae',
    source: 'mobile',
    spriteFile: 'SPRITE_Monstera.png',
    photoFile: 'IMG_Monstera.jpg',
    stats: { hp: 112, attack: 58, defense: 63, speed: 47 },
    metadata: {
      taxonomy: 'plant',
      confidence: 0.91,
    },
  },
  {
    id: 'demo-avatar-ficus-lyrata',
    speciesName: 'Ficus lyrata',
    speciesFamily: 'Moraceae',
    source: 'mobile',
    spriteFile: 'SPRITE_Ficus.png',
    photoFile: 'IMG_Ficus.jpg',
    stats: { hp: 134, attack: 39, defense: 74, speed: 33 },
    metadata: {
      taxonomy: 'tree',
      confidence: 0.89,
    },
  },
  {
    id: 'demo-avatar-amanita-muscaria',
    speciesName: 'Amanita muscaria',
    speciesFamily: 'Amanitaceae',
    source: 'web',
    spriteFile: 'SPRITE_Amanita.png',
    photoFile: 'IMG_Amanita.jpg',
    stats: { hp: 74, attack: 91, defense: 28, speed: 55 },
    metadata: {
      taxonomy: 'fungus',
      confidence: 0.82,
    },
  },
];

export interface SeedUser {
  id: string;
  email: string;
  displayName: string;
  isVerified: boolean;
}

export const SEED_USERS: SeedUser[] = [
  { id: DEMO_USER_ID, email: DEMO_EMAIL, displayName: 'DemoSprout', isVerified: true },
];

export interface SeedAvatarRow {
  id: string;
  userId: string;
  speciesName: string;
  speciesFamily: string;
  spriteUrl: string;
  discoveredAt: string;
  source: CaptureSource;
  isTemporary: boolean;
  expiresAt: string | null;
  stats: AvatarStats;
  metadata: Record<string, unknown>;
}

/** Materialises stable IDs with one seed-time timestamp for the whole set. */
export function buildAvatarRows(now: Date = new Date()): SeedAvatarRow[] {
  const discoveredAt = now.toISOString();
  return DEMO_AVATAR_TEMPLATES.map((a) => ({
    id: a.id,
    userId: DEMO_USER_ID,
    speciesName: a.speciesName,
    speciesFamily: a.speciesFamily,
    spriteUrl: plantAssetUrl(a.spriteFile),
    discoveredAt,
    source: a.source,
    ...retentionForSource(a.source, now),
    stats: a.stats,
    // photoUrl rides in metadata rather than on the record: it is presentation,
    // like displayName, and AvatarRecord has no column for it.
    metadata: { ...a.metadata, photoUrl: plantAssetUrl(a.photoFile) },
  }));
}
