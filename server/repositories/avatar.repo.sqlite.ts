/** SQLite implementation of the avatar repository (dev fallback / tests). */
import db from '../database/db';
import type {
  AvatarRecord,
  AvatarRepository,
  PaginatedAvatars,
} from '../models/avatar';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRecord(row: any): AvatarRecord {
  return {
    ...row,
    isTemporary: Boolean(row.isTemporary),
    stats: typeof row.stats === 'string' ? JSON.parse(row.stats) : row.stats,
    metadata:
      typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
  };
}

const sqliteAvatarRepository: AvatarRepository = {
  async listByUser(
    userId: string,
    page: number,
    pageSize: number
  ): Promise<PaginatedAvatars> {
    const [{ total }] = await db('avatar_records')
      .where({ userId })
      .count<{ total: number }[]>({ total: '*' });

    const rows = await db('avatar_records')
      .where({ userId })
      .orderBy('discoveredAt', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return {
      items: rows.map(toRecord),
      page,
      pageSize,
      total: Number(total),
    };
  },

  async getOwned(userId: string, avatarId: string): Promise<AvatarRecord | null> {
    const row = await db('avatar_records').where({ id: avatarId }).first();
    if (!row || row.userId !== userId) return null;
    return toRecord(row);
  },
};

export default sqliteAvatarRepository;
