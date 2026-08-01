/** Species dex — one record per species, shared across all users.
 *  Spec 2026-08-02 section E. */

export interface DexDiscovery {
  speciesKey: string;
  speciesName: string;
  /** UID of whoever scanned this species first. Never an email. */
  firstDiscoveredBy: string;
  firstDiscoveredAt: string;
  discoveryCount: number;
}

export interface DexRepository {
  /** Creates the species record, or increments its count if it already exists. */
  recordDiscovery(
    speciesKey: string,
    userId: string,
    speciesName: string
  ): Promise<DexDiscovery>;
  get(speciesKey: string): Promise<DexDiscovery | null>;
}
