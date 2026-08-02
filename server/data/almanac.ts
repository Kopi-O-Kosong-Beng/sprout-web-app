/**
 * The almanac's fixed taxonomy: 200 flowering plants a player can actually find
 * in Singapore.
 *
 * The species, family, status, origin and growth form all come from the
 * published checklist, so nothing here is invented:
 *
 *   Chong, K. Y., Tan, H. T. W. & Corlett, R. T. (2009). A Checklist of the
 *   Total Vascular Plant Flora of Singapore: Native, Naturalised and Cultivated
 *   Species. Raffles Museum of Biodiversity Research, NUS.
 *
 * scripts/extract-flora-checklist.py builds the JSON and documents the
 * selection rules. Two things it does are worth knowing here: only species the
 * checklist itself calls common, naturalised or casual are included, since an
 * almanac full of critically endangered forest specialists is one nobody can
 * complete; and families are drawn round-robin, because Poaceae and Cyperaceae
 * between them have 64 common species and an almanac that is a third roadside
 * grass is unplayable.
 *
 * Common names are the exception — the checklist has none. They are hand-added
 * for the species whose English or Malay name is well established here, and are
 * null for the rest rather than invented to fill the column.
 */
import taxonomy from './almanac-taxonomy.json';

export type AlmanacStatus = 'common' | 'naturalised' | 'casual';
export type AlmanacOrigin = 'native' | 'exotic' | 'weed of uncertain origin';
export type AlmanacGrowthForm =
  | 'tree'
  | 'herb'
  | 'shrub'
  | 'climber'
  | 'epiphyte'
  | 'strangler';

export interface AlmanacSpecies {
  /** Slugified binomial — the stable key for a species everywhere. */
  id: string;
  speciesName: string;
  family: string;
  commonName: string | null;
  status: AlmanacStatus;
  origin: AlmanacOrigin | null;
  growthForm: AlmanacGrowthForm | null;
}

export const ALMANAC_SPECIES = taxonomy as AlmanacSpecies[];

export const ALMANAC_SOURCE =
  'Chong, Tan & Corlett (2009), A Checklist of the Total Vascular Plant Flora ' +
  'of Singapore. Raffles Museum of Biodiversity Research, NUS.';

/**
 * The almanac key for a scientific name.
 *
 * Identifications arrive with whatever the upstream service returned — an
 * authority, a subspecies, odd capitalisation — so this reduces a name to the
 * binomial the almanac is keyed on. Anything that is not a plausible binomial
 * gets null rather than a guess: an unmatched scan is simply not an almanac
 * discovery, which is the honest outcome for "Unknown Plant Species".
 */
export function almanacIdForSpecies(speciesName: string): string | null {
  // Drop hybrid markers as whole words only. Stripping them by pattern ate the
  // "x " inside names like Cyathocalyx ramuliflorus and Ilex cymosa, which
  // silently made three of the almanac's own species unmatchable.
  const words = speciesName
    .trim()
    .split(/\s+/)
    .filter((word) => word && word !== '×' && word !== 'x');
  if (words.length < 2) return null;

  const genus = words[0].toLowerCase();
  const epithet = words[1].toLowerCase();
  if (!/^[a-z]+$/.test(genus) || !/^[a-z][a-z-]+$/.test(epithet)) return null;
  return `${genus}-${epithet}`;
}

const BY_ID = new Map(ALMANAC_SPECIES.map((species) => [species.id, species]));

/** The almanac entry a scientific name belongs to, if the almanac lists it. */
export function findAlmanacSpecies(speciesName: string): AlmanacSpecies | null {
  const id = almanacIdForSpecies(speciesName);
  return id ? (BY_ID.get(id) ?? null) : null;
}

export function almanacSpeciesById(id: string): AlmanacSpecies | null {
  return BY_ID.get(id) ?? null;
}
