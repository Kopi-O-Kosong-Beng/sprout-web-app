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
}
