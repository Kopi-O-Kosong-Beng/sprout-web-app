/** Shared demo dataset used by BOTH the SQLite seed and the Firestore seed, so
 *  the two datastores contain identical sample data.
 *
 *  DEMO_USER_ID is a fixed, well-known id. With AUTH_DEV_BYPASS=true the
 *  frontend can act as this user by sending header `x-dev-uid: demo-user-0001`
 *  and immediately see these avatars — no Firebase login needed yet.
 */
import { randomUUID } from 'crypto';
import type { AvatarStats } from '../models/avatar';

export const DEMO_USER_ID = 'demo-user-0001';
export const DEMO_EMAIL = 'demo@sprout.app';

interface SeedAvatar {
  speciesName: string;
  speciesFamily: string;
  source: 'mobile' | 'web';
  isTemporary: boolean;
  stats: AvatarStats;
  metadata: Record<string, unknown>;
}

const AVATARS: SeedAvatar[] = [
  {
    speciesName: 'Helianthus annuus',
    speciesFamily: 'Asteraceae',
    source: 'mobile',
    isTemporary: false,
    stats: { hp: 96, attack: 72, defense: 41, speed: 68 },
    metadata: {
      taxonomy: 'flower',
      confidence: 0.97,
      locality: { city: 'Singapore', venue: 'Gardens by the Bay' },
    },
  },
  {
    speciesName: 'Quercus robur',
    speciesFamily: 'Fagaceae',
    source: 'mobile',
    isTemporary: false,
    stats: { hp: 168, attack: 44, defense: 88, speed: 22 },
    metadata: {
      taxonomy: 'tree',
      confidence: 0.93,
      locality: { city: 'Singapore', venue: 'Botanic Gardens' },
    },
  },
  {
    speciesName: 'Monstera deliciosa',
    speciesFamily: 'Araceae',
    source: 'mobile',
    isTemporary: false,
    stats: { hp: 112, attack: 58, defense: 63, speed: 47 },
    metadata: { taxonomy: 'plant', confidence: 0.91 },
  },
  {
    speciesName: 'Ficus lyrata',
    speciesFamily: 'Moraceae',
    source: 'mobile',
    isTemporary: false,
    stats: { hp: 134, attack: 39, defense: 74, speed: 33 },
    metadata: { taxonomy: 'tree', confidence: 0.89 },
  },
  {
    speciesName: 'Amanita muscaria',
    speciesFamily: 'Amanitaceae',
    source: 'web',
    isTemporary: true, // TempAvatar from a web upload — 24h TTL
    stats: { hp: 74, attack: 91, defense: 28, speed: 55 },
    metadata: { taxonomy: 'fungus', confidence: 0.82 },
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
  source: 'mobile' | 'web';
  isTemporary: boolean;
  expiresAt: string | null;
  stats: AvatarStats;
  metadata: Record<string, unknown>;
}

/** Fully-materialised avatar rows for the demo user (stable ids per run). */
export function buildAvatarRows(): SeedAvatarRow[] {
  return AVATARS.map((a) => ({
    id: randomUUID(),
    userId: DEMO_USER_ID,
    speciesName: a.speciesName,
    speciesFamily: a.speciesFamily,
    spriteUrl: `/static/sprites/${a.speciesName.toLowerCase().replace(/\s+/g, '-')}.png`,
    discoveredAt: new Date().toISOString(),
    source: a.source,
    isTemporary: a.isTemporary,
    expiresAt: a.isTemporary
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      : null,
    stats: a.stats,
    metadata: a.metadata,
  }));
}
