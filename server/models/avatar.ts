/** Avatar domain model — Req 5/6/10. */
import type { CaptureSource } from '../data/capture-source';

export interface AvatarStats {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
}

export interface AvatarRecord {
  id: string;
  userId: string;
  speciesName: string;
  speciesFamily: string | null;
  spriteUrl: string;
  discoveredAt: string;
  /** 'mobile' = discovered in the field; 'web' = uploaded on the web platform */
  source: 'mobile' | 'web';
  /** Web uploads are temporary (24h TTL) and excluded from the mobile archive */
  isTemporary: boolean;
  expiresAt: string | null;
  stats: AvatarStats;
  metadata: Record<string, unknown> | null;
}

export interface PaginatedAvatars {
  items: AvatarRecord[];
  page: number;
  pageSize: number;
  total: number;
}

/** What a completed scan contributes to the archive — spec 2026-08-02 section C. */
export interface ScanUpsertInput {
  speciesName: string;
  speciesFamily: string | null;
  spriteUrl: string;
  stats: AvatarStats;
  metadata: Record<string, unknown> | null;
  /** How the photo reached the pipeline, which decides the record's lifetime:
   *  a camera scan is kept, a file upload expires in 24h (Req 6.12). See
   *  data/capture-source.ts — the badge the archive shows and the lifetime the
   *  record has both come from this one field, so they cannot disagree. */
  source: CaptureSource;
}

export interface AvatarRepository {
  /** Returns the caller's avatars only (Req 5.5 ownership). Paginated (Req 5.1). */
  listByUser(userId: string, page: number, pageSize: number): Promise<PaginatedAvatars>;
  /** Returns a single avatar iff it belongs to the caller, else null. */
  getOwned(userId: string, avatarId: string): Promise<AvatarRecord | null>;
  /** Deletes an avatar iff it belongs to the caller. True when a record was
   *  removed; false when it never existed or is someone else's. */
  deleteOwned(userId: string, avatarId: string): Promise<boolean>;
  /** Creates the caller's record for a species, or returns the existing one.
   *  De-duplicates on the sanitized species name (Req UC4 collection rules). */
  upsertFromScan(
    userId: string,
    input: ScanUpsertInput
  ): Promise<{ record: AvatarRecord; created: boolean }>;
  /** Creates any missing, caller-owned records in the fixed demo set. */
  ensureDemoSet(userId: string): Promise<PaginatedAvatars>;
  /** Removes only verified caller-owned records in the fixed demo set. */
  removeDemoSet(userId: string): Promise<PaginatedAvatars>;
}
