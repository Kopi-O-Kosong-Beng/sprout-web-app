/**
 * Assembles the almanac: the fixed taxonomy, plus what players have found.
 *
 * Two views, and the difference between them is the whole privacy model. The
 * public view says whether a species has been found and how often, and nothing
 * about who found it — the landing page is unauthenticated, and a finder's
 * display name and their own photograph are not things to hand to the open
 * internet. The detailed view adds the credit and the photo, and every caller
 * of it is behind auth.
 */
import {
  ALMANAC_SOURCE,
  ALMANAC_SPECIES,
  almanacSpeciesById,
  findAlmanacSpecies,
  type AlmanacSpecies,
} from '../data/almanac';
import type { AvatarStats } from '../models/avatar';
import type { AlmanacDiscovery, DiscoveryClaim } from '../models/almanac';
import almanacRepository from '../repositories/almanac';
import authUserRepository from '../repositories/auth-users';

/** A card in the grid. Deliberately lean: 200 of these go over the wire at
 *  once, so the sprite is not among them. */
export interface PublicAlmanacEntry extends AlmanacSpecies {
  discovered: boolean;
  discoveryCount: number;
}

/**
 * One species opened up, as an anonymous visitor sees it.
 *
 * The sprite, the stats and the botanical record describe the *species* — they
 * are what the game made of it, and showing them is the point of the almanac.
 * The finder's name, the date and their own photograph describe a *person*, and
 * live on DetailedAlmanacEntry behind a login.
 */
export interface PublicAlmanacDetail extends PublicAlmanacEntry {
  spriteUrl: string | null;
  stats: AvatarStats | null;
  description: string | null;
  commonNames: string[];
  taxonomy: Record<string, string>;
  confidence: number | null;
}

/** The same card once someone is signed in. */
export interface DetailedAlmanacEntry extends PublicAlmanacDetail {
  discoveredByName: string | null;
  discoveredAt: string | null;
  photoUrl: string | null;
}

export interface AlmanacSummary<Entry> {
  source: string;
  total: number;
  discovered: number;
  species: Entry[];
}

function toPublic(
  species: AlmanacSpecies,
  discovery: AlmanacDiscovery | undefined
): PublicAlmanacEntry {
  return {
    ...species,
    discovered: Boolean(discovery),
    discoveryCount: discovery?.discoveryCount ?? 0,
  };
}

function toPublicDetail(
  species: AlmanacSpecies,
  discovery: AlmanacDiscovery | undefined
): PublicAlmanacDetail {
  return {
    ...toPublic(species, discovery),
    spriteUrl: discovery?.spriteUrl || null,
    stats: discovery?.stats ?? null,
    description: discovery?.description ?? null,
    commonNames: discovery?.commonNames ?? [],
    taxonomy: discovery?.taxonomy ?? {},
    confidence: discovery?.confidence ?? null,
  };
}

function toDetailed(
  species: AlmanacSpecies,
  discovery: AlmanacDiscovery | undefined
): DetailedAlmanacEntry {
  return {
    ...toPublicDetail(species, discovery),
    discoveredByName: discovery?.discoveredByName ?? null,
    discoveredAt: discovery?.discoveredAt ?? null,
    photoUrl: discovery?.photoUrl ?? null,
  };
}

async function discoveriesById(): Promise<Map<string, AlmanacDiscovery>> {
  const discoveries = await almanacRepository.listDiscoveries();
  return new Map(discoveries.map((discovery) => [discovery.speciesId, discovery]));
}

/** The whole almanac, minus anything that identifies a player. */
export async function getPublicAlmanac(): Promise<
  AlmanacSummary<PublicAlmanacEntry>
> {
  const found = await discoveriesById();
  const species = ALMANAC_SPECIES.map((entry) => toPublic(entry, found.get(entry.id)));
  return {
    source: ALMANAC_SOURCE,
    total: species.length,
    discovered: species.filter((entry) => entry.discovered).length,
    species,
  };
}

/**
 * One card opened up. Null when the id is not in the taxonomy.
 *
 * `signedIn` decides how much comes back, not whether anything does — the
 * landing page opens these cards for visitors who have no account.
 */
export async function getAlmanacEntry(
  speciesId: string,
  options: { signedIn: boolean } = { signedIn: false }
): Promise<PublicAlmanacDetail | DetailedAlmanacEntry | null> {
  const species = almanacSpeciesById(speciesId);
  if (!species) return null;

  const discoveries = await almanacRepository.listDiscoveries();
  const discovery = discoveries.find((entry) => entry.speciesId === speciesId);
  return options.signedIn
    ? toDetailed(species, discovery)
    : toPublicDetail(species, discovery);
}

/** A discovery of something the almanac does not list — anything a player
 *  scanned that is not one of the 200, which is what tells an admin the
 *  taxonomy needs extending. */
export interface OffTaxonomyDiscovery {
  speciesId: string;
  speciesName: string;
  discoveredByName: string;
  discoveredAt: string;
  discoveryCount: number;
}

export interface AdminAlmanac extends AlmanacSummary<DetailedAlmanacEntry> {
  offTaxonomy: OffTaxonomyDiscovery[];
}

/** The admin view: every card in full, plus what was found outside the list. */
export async function getAdminAlmanac(): Promise<AdminAlmanac> {
  const discoveries = await almanacRepository.listDiscoveries();
  const found = new Map(discoveries.map((discovery) => [discovery.speciesId, discovery]));
  const species = ALMANAC_SPECIES.map((entry) => toDetailed(entry, found.get(entry.id)));
  const listed = new Set(ALMANAC_SPECIES.map((entry) => entry.id));

  return {
    source: ALMANAC_SOURCE,
    total: species.length,
    discovered: species.filter((entry) => entry.discovered).length,
    species,
    offTaxonomy: discoveries
      .filter((discovery) => !listed.has(discovery.speciesId))
      .map((discovery) => ({
        speciesId: discovery.speciesId,
        speciesName: discovery.speciesName,
        discoveredByName: discovery.discoveredByName,
        discoveredAt: discovery.discoveredAt,
        discoveryCount: discovery.discoveryCount,
      })),
  };
}

export interface ScanDiscoveryInput {
  speciesName: string;
  userId: string;
  avatarId: string;
  photoUrl: string | null;
  discoveredAt: string;
  /** The finished sprite and the record behind it, snapshotted onto the
   *  discovery so the almanac never reads another player's avatar record. */
  spriteUrl: string;
  stats: AvatarStats;
  description: string | null;
  commonNames: string[];
  taxonomy: Record<string, string>;
  confidence: number | null;
}

/**
 * Records a saved scan against the almanac.
 *
 * Returns the claim's outcome, or null when the scan is not an almanac
 * discovery: an off-list species, or an identification too vague to key on.
 * Callers treat a throw as non-fatal — the archive save has already succeeded
 * by this point, and losing a tally is not worth failing it over.
 */
export async function recordScanDiscovery(
  input: ScanDiscoveryInput
): Promise<{ species: AlmanacSpecies; firstDiscovery: boolean } | null> {
  const species = findAlmanacSpecies(input.speciesName);
  if (!species) return null;

  const profile = await authUserRepository.getById(input.userId);
  const claim: DiscoveryClaim = {
    speciesId: species.id,
    speciesName: input.speciesName,
    userId: input.userId,
    // A missing profile still gets credited, just anonymously — the discovery
    // is real either way, and this runs on the dev-bypass path too.
    displayName: profile?.displayName?.trim() || 'A Sprout player',
    avatarId: input.avatarId,
    photoUrl: input.photoUrl,
    discoveredAt: input.discoveredAt,
    spriteUrl: input.spriteUrl,
    stats: input.stats,
    description: input.description,
    commonNames: input.commonNames,
    taxonomy: input.taxonomy,
    confidence: input.confidence,
  };

  const discovery = await almanacRepository.recordDiscovery(claim);
  return {
    species,
    firstDiscovery:
      discovery.discoveryCount === 1 && discovery.discoveredByUserId === input.userId,
  };
}
