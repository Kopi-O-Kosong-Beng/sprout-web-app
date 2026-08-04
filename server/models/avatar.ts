/** Avatar domain model — Req 5/6/10. */

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

/** A record the caller is asking us to create — everything but id and userId,
 *  which the repository owns, and discoveredAt, which is the write time. */
export interface NewAvatarInput {
  speciesName: string;
  speciesFamily: string | null;
  spriteUrl: string;
  source: 'mobile' | 'web';
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

export interface AvatarRepository {
  /** Returns the caller's avatars only (Req 5.5 ownership). Paginated (Req 5.1). */
  listByUser(userId: string, page: number, pageSize: number): Promise<PaginatedAvatars>;
  /** Returns a single avatar iff it belongs to the caller, else null. */
  getOwned(userId: string, avatarId: string): Promise<AvatarRecord | null>;
  /** Deletes an avatar iff it belongs to the caller. True when a record was
   *  removed; false when it never existed or is someone else's. */
  deleteOwned(userId: string, avatarId: string): Promise<boolean>;
  /** Persists a newly scanned avatar owned by the caller (Req 6.12). */
  createForUser(
    userId: string,
    input: NewAvatarInput,
    now?: Date
  ): Promise<AvatarRecord>;
  /** Creates any missing, caller-owned records in the fixed demo set. */
  ensureDemoSet(userId: string): Promise<PaginatedAvatars>;
  /** Removes only verified caller-owned records in the fixed demo set. */
  removeDemoSet(userId: string): Promise<PaginatedAvatars>;
}
