/** Deterministic demo catalogue used by Firestore seed tooling.
 *
 *  DEMO_USER_ID is a fixed, well-known id. With AUTH_DEV_BYPASS=true the
 *  frontend can act as this user by sending header `x-dev-uid: demo-user-0001`
 *  and immediately see these avatars — no Firebase login needed yet.
 */
import { createHash } from 'crypto';
import type { AvatarStats } from '../models/avatar';

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
  source: 'mobile' | 'web';
  isTemporary: boolean;
  stats: AvatarStats;
  metadata: Record<string, unknown>;
}

export const DEMO_AVATAR_TEMPLATES: DemoAvatarTemplate[] = [
  {
    id: 'demo-avatar-helianthus-annuus',
    speciesName: 'Helianthus annuus',
    speciesFamily: 'Asteraceae',
    source: 'mobile',
    isTemporary: false,
    stats: { hp: 96, attack: 72, defense: 41, speed: 68 },
    metadata: {
      taxonomy: 'flower',
      confidence: 0.97,
      locality: { city: 'Singapore', venue: 'Gardens by the Bay' },
      habitat: 'Open fields and cultivated plots in full sun',
      conservationStatus: 'Least Concern',
    },
  },
  {
    id: 'demo-avatar-quercus-robur',
    speciesName: 'Quercus robur',
    speciesFamily: 'Fagaceae',
    source: 'mobile',
    isTemporary: false,
    stats: { hp: 168, attack: 44, defense: 88, speed: 22 },
    metadata: {
      taxonomy: 'tree',
      confidence: 0.93,
      locality: { city: 'Singapore', venue: 'Botanic Gardens' },
      habitat: 'Temperate deciduous woodland',
      conservationStatus: 'Least Concern',
    },
  },
  {
    id: 'demo-avatar-monstera-deliciosa',
    speciesName: 'Monstera deliciosa',
    speciesFamily: 'Araceae',
    source: 'mobile',
    isTemporary: false,
    stats: { hp: 112, attack: 58, defense: 63, speed: 47 },
    metadata: {
      taxonomy: 'plant',
      confidence: 0.91,
      habitat: 'Tropical rainforest understorey',
      conservationStatus: 'Least Concern',
    },
  },
  {
    id: 'demo-avatar-ficus-lyrata',
    speciesName: 'Ficus lyrata',
    speciesFamily: 'Moraceae',
    source: 'mobile',
    isTemporary: false,
    stats: { hp: 134, attack: 39, defense: 74, speed: 33 },
    metadata: {
      taxonomy: 'tree',
      confidence: 0.89,
      habitat: 'West African lowland rainforest',
      conservationStatus: 'Least Concern',
    },
  },
  {
    id: 'demo-avatar-amanita-muscaria',
    speciesName: 'Amanita muscaria',
    speciesFamily: 'Amanitaceae',
    source: 'web',
    isTemporary: true, // TempAvatar from a web upload — 24h TTL
    stats: { hp: 74, attack: 91, defense: 28, speed: 55 },
    metadata: {
      taxonomy: 'fungus',
      confidence: 0.82,
      habitat: 'Birch and conifer woodland, often near host trees',
      conservationStatus: 'Not Evaluated',
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
  source: 'mobile' | 'web';
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
    spriteUrl: `/static/sprites/${a.speciesName.toLowerCase().replace(/\s+/g, '-')}.png`,
    discoveredAt,
    source: a.source,
    isTemporary: a.isTemporary,
    expiresAt: a.isTemporary
      ? new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
      : null,
    stats: a.stats,
    metadata: a.metadata,
  }));
}
