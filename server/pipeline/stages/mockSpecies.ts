/**
 * The species pool the mock identification draws from.
 *
 * Why this exists: the mock answers "Polygala calcarea" for every photograph.
 * That is correct for a test suite — a fixed answer is what makes an assertion
 * possible — but it makes a keyless demo far weaker than the product. Every
 * scan resolves to the same species, so it lands on the same canonical dex
 * record, and a visitor who photographs five different plants ends the
 * afternoon with one creature in their archive, four of the scans having
 * silently updated the first.
 *
 * With this pool the species is still deterministic — the same photograph
 * always yields the same creature, so nothing becomes untestable — but two
 * different photographs almost always yield different ones. The archive fills
 * up, first-discovery fires repeatedly, and the leaderboard moves, which is the
 * loop the product is actually about.
 *
 * Opt-in via MOCK_IDENTIFY_MODE=varied, so the default stays fixed and every
 * existing suite keeps the answer it asserts on.
 *
 * ── On the data ──────────────────────────────────────────────────────────────
 * Species, family, order and genus are real, and all ten are plants a visitor
 * could plausibly photograph in Singapore. The growing conditions are
 * indicative horticultural values chosen to be reasonable, not readings from a
 * cited source — the same standing as the "Full sun / Chalky / Moderate" the
 * fixed mock has always returned. Nothing here is presented to a player as
 * authoritative: the almanac, which IS sourced, is a separate dataset.
 */

export interface MockSpecies {
  name: string;
  commonNames: string[];
  order: string;
  family: string;
  genus: string;
  description: string;
  light: string;
  soil: string;
  watering: string;
}

export const MOCK_SPECIES_POOL: MockSpecies[] = [
  {
    name: 'Monstera deliciosa',
    commonNames: ['Swiss cheese plant', 'split-leaf philodendron'],
    order: 'Alismatales',
    family: 'Araceae',
    genus: 'Monstera',
    description:
      'A climbing evergreen with large glossy leaves that develop holes and deep splits as they mature.',
    light: 'Bright indirect light',
    soil: 'Well-drained, peat-based',
    watering: 'Moderate',
  },
  {
    name: 'Ficus benjamina',
    commonNames: ['weeping fig', 'benjamin fig'],
    order: 'Rosales',
    family: 'Moraceae',
    genus: 'Ficus',
    description:
      'A slender-branched tree with drooping shoots and small, pointed, glossy leaves.',
    light: 'Bright indirect light',
    soil: 'Loamy, free-draining',
    watering: 'Moderate',
  },
  {
    name: 'Hibiscus rosa-sinensis',
    commonNames: ['Chinese hibiscus', 'bunga raya'],
    order: 'Malvales',
    family: 'Malvaceae',
    genus: 'Hibiscus',
    description:
      'A shrub bearing large trumpet-shaped flowers with a long protruding staminal column.',
    light: 'Full sun',
    soil: 'Rich, well-drained',
    watering: 'Frequent',
  },
  {
    name: 'Plumeria rubra',
    commonNames: ['frangipani', 'temple tree'],
    order: 'Gentianales',
    family: 'Apocynaceae',
    genus: 'Plumeria',
    description:
      'A small deciduous tree with thick blunt branches and fragrant five-petalled flowers.',
    light: 'Full sun',
    soil: 'Sandy, sharply drained',
    watering: 'Sparse',
  },
  {
    name: 'Bougainvillea glabra',
    commonNames: ['paper flower', 'lesser bougainvillea'],
    order: 'Caryophyllales',
    family: 'Nyctaginaceae',
    genus: 'Bougainvillea',
    description:
      'A thorny climber whose small cream flowers sit inside vivid papery bracts.',
    light: 'Full sun',
    soil: 'Poor to average, free-draining',
    watering: 'Sparse',
  },
  {
    name: 'Ixora coccinea',
    commonNames: ['jungle geranium', 'jungle flame'],
    order: 'Gentianales',
    family: 'Rubiaceae',
    genus: 'Ixora',
    description:
      'A dense evergreen shrub carrying rounded clusters of small tubular flowers.',
    light: 'Full sun to partial shade',
    soil: 'Acidic, well-drained',
    watering: 'Moderate',
  },
  {
    name: 'Cocos nucifera',
    commonNames: ['coconut palm'],
    order: 'Arecales',
    family: 'Arecaceae',
    genus: 'Cocos',
    description:
      'A tall single-stemmed palm with a crown of long pinnate fronds and large fibrous fruit.',
    light: 'Full sun',
    soil: 'Sandy, free-draining',
    watering: 'Frequent',
  },
  {
    name: 'Codiaeum variegatum',
    commonNames: ['croton', 'garden croton'],
    order: 'Malpighiales',
    family: 'Euphorbiaceae',
    genus: 'Codiaeum',
    description:
      'A shrub grown for leathery leaves marked in combinations of green, yellow, orange and red.',
    light: 'Bright light',
    soil: 'Rich, well-drained',
    watering: 'Moderate',
  },
  {
    name: 'Alocasia macrorrhizos',
    commonNames: ['giant taro', 'elephant ear'],
    order: 'Alismatales',
    family: 'Araceae',
    genus: 'Alocasia',
    description:
      'A large herb with upright arrow-shaped leaves held on thick succulent stalks.',
    light: 'Partial shade',
    soil: 'Moist, humus-rich',
    watering: 'Frequent',
  },
  {
    name: 'Helianthus annuus',
    commonNames: ['sunflower', 'common sunflower'],
    order: 'Asterales',
    family: 'Asteraceae',
    genus: 'Helianthus',
    description:
      'A tall annual with a coarse hairy stem and a single broad flower head of yellow ray florets.',
    light: 'Full sun',
    soil: 'Average, well-drained',
    watering: 'Moderate',
  },
];

/**
 * A stable 32-bit digest of the photograph, used only to choose a species.
 *
 * FNV-1a over a sample rather than a hash of the whole payload: uploads run to
 * megabytes and this is a mock path that should not become the slowest hop in
 * the pipeline. The sample is taken at fixed offsets and mixed with the total
 * length, so it is fully deterministic — the same photograph always selects the
 * same species, which is what keeps this testable — while still differing
 * between two photographs that happen to share a prefix, as base64 of images
 * from one camera often will.
 *
 * Not a security primitive and not used as one. Collisions are acceptable here:
 * the worst case is two photographs yielding the same plant.
 */
export function digestPhoto(photoBase64: string): number {
  const SAMPLE = 2048;
  const head = photoBase64.slice(0, SAMPLE);
  const tail = photoBase64.slice(-SAMPLE);
  const mid = photoBase64.slice(
    Math.max(0, Math.floor(photoBase64.length / 2) - SAMPLE / 2),
    Math.max(0, Math.floor(photoBase64.length / 2) + SAMPLE / 2)
  );
  const material = `${photoBase64.length}:${head}${mid}${tail}`;

  let hash = 0x811c9dc5;
  for (let i = 0; i < material.length; i += 1) {
    hash ^= material.charCodeAt(i);
    // FNV prime, via shifts so the arithmetic stays in 32 bits.
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    hash >>>= 0;
  }
  return hash >>> 0;
}

/** The species this photograph always resolves to. */
export function pickMockSpecies(photoBase64: string): MockSpecies {
  return MOCK_SPECIES_POOL[digestPhoto(photoBase64) % MOCK_SPECIES_POOL.length];
}
