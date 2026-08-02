/** Species dex — one record per species, shared across all users.
 *  Spec 2026-08-02 section E. */

export interface DexDiscovery {
  speciesKey: string;
  speciesName: string;
  /** UID of whoever scanned this species first. Never an email. */
  firstDiscoveredBy: string;
  firstDiscoveredAt: string;
  discoveryCount: number;
  /** The canonical sprite for the species, as stored by sprite-storage.
   *  Empty on records written before the almanac needed it. */
  spriteUrl: string;
}

export interface DexRepository {
  /** Creates the species record, or increments its count if it already exists. */
  recordDiscovery(
    speciesKey: string,
    userId: string,
    speciesName: string,
    spriteUrl?: string
  ): Promise<DexDiscovery>;
  get(speciesKey: string): Promise<DexDiscovery | null>;
  /** Every species found so far. The almanac renders 200 cards in one pass, so
   *  it reads the collection rather than calling get() per species. */
  list(): Promise<DexDiscovery[]>;
}
