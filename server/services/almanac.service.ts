/**
 * Assembles the almanac: the fixed taxonomy, plus what players have found.
 *
 * The discovery half is the `dex` collection — the same records the scan route
 * writes and the scan result reads. It used to be a second collection of my
 * own, written from a second save path; both were superseded when scan
 * persistence moved server-side, and keeping two ledgers of "who found this
 * species first" would have meant two answers to that question.
 *
 * Two views, and the difference between them is the whole privacy model. The
 * public view says whether a species has been found and how often, and nothing
 * about who found it — the landing page is unauthenticated, and a finder's
 * display name is not something to hand to the open internet. The detailed view
 * adds the credit, and every caller of it presented a token.
 */
import {
  ALMANAC_SOURCE,
  ALMANAC_SPECIES,
  almanacIdForSpecies,
  almanacSpeciesById,
  type AlmanacSpecies,
} from '../data/almanac';
import { deriveSpeciesStats } from '../data/species-stats';
import type { AvatarStats } from '../models/avatar';
import type { DexDiscovery } from '../models/dex';
import { sanitizeSpeciesKey } from '../pipeline/dex';
import dexRepository from '../repositories/dex';
import { resolveDiscoveryForSpecies } from './discovery';

/** A card in the grid. Deliberately lean: 200 of these go over the wire at
 *  once, so the sprite is not among them. */
export interface PublicAlmanacEntry extends AlmanacSpecies {
  discovered: boolean;
  discoveryCount: number;
}

/**
 * One species opened up, as an anonymous visitor sees it.
 *
 * The sprite and the stats describe the *species* — they are what the game made
 * of it, and showing them is the point of the almanac. The finder's name and
 * the discovery date describe a *person*, and live on DetailedAlmanacEntry
 * behind a login.
 */
export interface PublicAlmanacDetail extends PublicAlmanacEntry {
  spriteUrl: string | null;
  /** Derived from the species key, exactly as the scan route derives them, so
   *  the almanac and the archive never disagree about a plant's stats. */
  stats: AvatarStats;
}

export interface DetailedAlmanacEntry extends PublicAlmanacDetail {
  discoveredByName: string | null;
  discoveredAt: string | null;
  /** True when the caller is the one who found it first. */
  isFirstDiscoverer: boolean;
}

export interface AlmanacSummary<Entry> {
  source: string;
  total: number;
  discovered: number;
  species: Entry[];
}

/**
 * The dex key for an almanac species.
 *
 * The two keying schemes differ — the almanac slugs with hyphens for URLs, the
 * dex sanitises with underscores — so this is the one place they are bridged.
 */
export function dexKeyFor(species: AlmanacSpecies): string {
  return sanitizeSpeciesKey(species.speciesName);
}

function toPublic(
  species: AlmanacSpecies,
  discovery: DexDiscovery | undefined
): PublicAlmanacEntry {
  return {
    ...species,
    discovered: Boolean(discovery),
    discoveryCount: discovery?.discoveryCount ?? 0,
  };
}

function toPublicDetail(
  species: AlmanacSpecies,
  discovery: DexDiscovery | undefined
): PublicAlmanacDetail {
  return {
    ...toPublic(species, discovery),
    spriteUrl: discovery?.spriteUrl || null,
    stats: deriveSpeciesStats(dexKeyFor(species)),
  };
}

/**
 * The dex key a species name reduces to once its authority and any
 * infraspecific rank are dropped — `Acanthus ilicifolius L.` and
 * `Acanthus ilicifolius subsp. ilicifolius` both to `acanthus_ilicifolius`.
 *
 * Null when the name is not a plausible binomial, which is the honest answer
 * for "Unknown Plant Species" and the like.
 */
function binomialDexKey(speciesName: string): string | null {
  const id = almanacIdForSpecies(speciesName);
  return id ? sanitizeSpeciesKey(id) : null;
}

/**
 * Dex discoveries, indexed by every key an almanac species might look them up
 * under.
 *
 * The exact `speciesKey` wins, and the binomial-reduced key is only added where
 * nothing already claims it. Both are needed because the dex keys on whatever
 * the identifier returned: Plant.id routinely answers with an authority
 * (`Lantana camara L.`), which sanitises to `lantana_camara_l` and matches no
 * almanac species at all. That is not a rare edge — it is most real
 * identifications of the 200, and it is why the almanac sat at 0 discovered
 * while the dex filled up. Normalising here rather than at write time leaves
 * the stored key alone, which also names the species' sprite object in storage.
 */
async function discoveriesByKey(): Promise<Map<string, DexDiscovery>> {
  const discoveries = await dexRepository.list();
  const byKey = new Map(
    discoveries.map((discovery) => [discovery.speciesKey, discovery] as const)
  );

  for (const discovery of discoveries) {
    const reduced = binomialDexKey(discovery.speciesName);
    if (!reduced || byKey.has(reduced)) continue;
    byKey.set(reduced, discovery);
  }

  return byKey;
}

/** The whole almanac, minus anything that identifies a player. */
export async function getPublicAlmanac(): Promise<
  AlmanacSummary<PublicAlmanacEntry>
> {
  const found = await discoveriesByKey();
  const species = ALMANAC_SPECIES.map((entry) =>
    toPublic(entry, found.get(dexKeyFor(entry)))
  );
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
 * `callerUid` decides how much comes back, not whether anything does — the
 * landing page opens these cards for visitors who have no account. When it is
 * present the finder is resolved through the same path the scan result uses,
 * so a uid is turned into a display name in exactly one place.
 */
export async function getAlmanacEntry(
  speciesId: string,
  callerUid?: string
): Promise<PublicAlmanacDetail | DetailedAlmanacEntry | null> {
  const species = almanacSpeciesById(speciesId);
  if (!species) return null;

  const discovery = (await dexRepository.get(dexKeyFor(species))) ?? undefined;
  const publicDetail = toPublicDetail(species, discovery);
  if (!callerUid) return publicDetail;

  const resolved = await resolveDiscoveryForSpecies(species.speciesName, callerUid);
  return {
    ...publicDetail,
    discoveredByName: resolved?.firstDiscoveredByName ?? null,
    discoveredAt: resolved?.firstDiscoveredAt ?? null,
    isFirstDiscoverer: resolved?.isFirstDiscoverer ?? false,
  };
}

/** A discovery of something the almanac does not list — anything a player
 *  scanned that is not one of the 200, which is what tells an admin the
 *  taxonomy needs extending. */
export interface OffTaxonomyDiscovery {
  speciesKey: string;
  speciesName: string;
  discoveredAt: string;
  discoveryCount: number;
}

export interface AdminAlmanac extends AlmanacSummary<PublicAlmanacDetail> {
  offTaxonomy: OffTaxonomyDiscovery[];
}

/** The admin view: every card in full, plus what was found outside the list. */
export async function getAdminAlmanac(): Promise<AdminAlmanac> {
  const discoveries = await dexRepository.list();
  const found = new Map(discoveries.map((entry) => [entry.speciesKey, entry]));
  const listed = new Set(ALMANAC_SPECIES.map((entry) => dexKeyFor(entry)));
  const species = ALMANAC_SPECIES.map((entry) =>
    toPublicDetail(entry, found.get(dexKeyFor(entry)))
  );

  return {
    source: ALMANAC_SOURCE,
    total: species.length,
    discovered: species.filter((entry) => entry.discovered).length,
    species,
    offTaxonomy: discoveries
      .filter((discovery) => !listed.has(discovery.speciesKey))
      .map((discovery) => ({
        speciesKey: discovery.speciesKey,
        speciesName: discovery.speciesName,
        discoveredAt: discovery.firstDiscoveredAt,
        discoveryCount: discovery.discoveryCount,
      })),
  };
}
