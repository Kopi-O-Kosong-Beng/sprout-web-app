/** Sprite candidates — every render the pipeline produces for a species.
 *
 *  The dex keeps exactly one canonical sprite per species (`dex.spriteUrl`,
 *  the "global reference" the almanac and discovery views show). Before this
 *  collection existed, a rescan's freshly generated sprite was simply thrown
 *  away — storage saw `v1.png` already existed and returned the old URL — so
 *  there was nothing for an admin to choose between.
 *
 *  Now every render of an identified species is kept as a candidate:
 *  the first ever scan is recorded as version 1 and PUBLISHED immediately
 *  (players need a sprite in the almanac from day one), and each later render
 *  is stored as `sprites/<key>/v<N>.png` plus a PENDING row here. The studio's
 *  Dex Gate lists them, and publishing one atomically swaps the global
 *  reference. Players' own archive records are untouched by any of this.
 */

export type DexCandidateStatus = 'PENDING' | 'PUBLISHED' | 'REJECTED';

/** What the pipeline knew about the render when it saved it. Everything is
 *  nullable because the backfilled legacy v1 rows know nothing at all. */
export interface DexCandidateEvaluation {
  autoApproved: boolean | null;
  judgeCute: number | null;
  removeBgOk: boolean | null;
  paletteValid: boolean | null;
  dimsOk: boolean | null;
  notBlank: boolean | null;
  /** Plant.id's probability for the identification that produced this render. */
  confidence: number | null;
}

export interface DexCandidate {
  /** `${speciesKey}__v${version}` — deterministic, so a version can never be
   *  recorded twice. `__` cannot appear in a sanitized species key, which is
   *  the same property scopeSpeciesKeyToUser relies on. */
  id: string;
  speciesKey: string;
  speciesName: string;
  version: number;
  spriteUrl: string;
  status: DexCandidateStatus;
  /** UID of the scanner whose photo produced this render. Empty on the
   *  backfilled v1 of a species that predates this collection. */
  scannedBy: string;
  createdAt: string;
  evaluation: DexCandidateEvaluation | null;
}

export interface DexCandidateRepository {
  /** Highest version recorded for a species, 0 when it has none. */
  maxVersion(speciesKey: string): Promise<number>;
  /** Creates the row, failing (never overwriting) if the id already exists. */
  create(candidate: DexCandidate): Promise<void>;
  get(id: string): Promise<DexCandidate | null>;
  /** Newest first. The gate renders them all in one pass. */
  listAll(limit?: number): Promise<DexCandidate[]>;
  /** Makes this candidate the global reference: sets it PUBLISHED, demotes the
   *  previously published sprite of the species to PENDING, and points
   *  `dex.spriteUrl` at it — atomically. */
  publish(id: string): Promise<DexCandidate>;
  /** Rejects a candidate. Refuses to reject the currently published one,
   *  because that would leave the species with a reference nothing vouches
   *  for — publish something else first. */
  reject(id: string): Promise<DexCandidate>;
}
