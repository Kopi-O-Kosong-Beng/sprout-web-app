import { randomUUID } from 'crypto';
import db from '../database/db';
import type {
  AuthUserProfile,
  AuthUserRepository,
  CreateAuthUserProfile,
  PasswordHistoryEntry,
} from '../models/auth';

function toProfile(row: Record<string, unknown>): AuthUserProfile {
  return {
    id: String(row.id),
    email: String(row.email),
    displayName: String(row.displayName),
    isVerified: Boolean(row.isVerified),
    passwordHash: (row.passwordHash as string | null | undefined) ?? null,
    resetOtpHash: (row.resetOtpHash as string | null | undefined) ?? null,
    resetOtpExpiresAt: row.resetOtpExpiresAt
      ? new Date(row.resetOtpExpiresAt as string).toISOString()
      : null,
    createdAt: row.createdAt ? new Date(row.createdAt as string).toISOString() : undefined,
    updatedAt: row.updatedAt ? new Date(row.updatedAt as string).toISOString() : undefined,
  };
}

const sqliteAuthUserRepository: AuthUserRepository = {
  async createProfile(input: CreateAuthUserProfile): Promise<AuthUserProfile> {
    const now = new Date().toISOString();
    await db('users').insert({
      ...input,
      createdAt: now,
      updatedAt: now,
    });
    return (await this.getById(input.id))!;
  },

  async getById(id: string): Promise<AuthUserProfile | null> {
    const row = await db('users').where({ id }).first();
    return row ? toProfile(row) : null;
  },

  async getByEmail(email: string): Promise<AuthUserProfile | null> {
    const row = await db('users').where({ email }).first();
    return row ? toProfile(row) : null;
  },

  async markVerified(id: string): Promise<void> {
    await db('users')
      .where({ id })
      .update({ isVerified: true, updatedAt: new Date().toISOString() });
  },

  async setResetOtp(
    id: string,
    resetOtpHash: string | null,
    resetOtpExpiresAt: string | null
  ): Promise<void> {
    await db('users').where({ id }).update({
      resetOtpHash,
      resetOtpExpiresAt,
      updatedAt: new Date().toISOString(),
    });
  },

  async updatePasswordAndClearOtp(id: string, passwordHash: string): Promise<void> {
    await db('users').where({ id }).update({
      passwordHash,
      resetOtpHash: null,
      resetOtpExpiresAt: null,
      updatedAt: new Date().toISOString(),
    });
  },

  async addPasswordHistory(userId: string, passwordHash: string): Promise<void> {
    await db('password_history').insert({
      id: randomUUID(),
      userId,
      passwordHash,
      changedAt: new Date().toISOString(),
    });
  },

  async listPasswordHistory(
    userId: string,
    limit: number
  ): Promise<PasswordHistoryEntry[]> {
    return db('password_history')
      .where({ userId })
      .orderBy('changedAt', 'desc')
      .limit(limit);
  },

  async prunePasswordHistory(userId: string, keep: number): Promise<void> {
    const rows = await db('password_history')
      .where({ userId })
      .orderBy('changedAt', 'desc')
      .select<{ id: string }[]>('id');
    const staleIds = rows.slice(keep).map((row) => row.id);
    if (staleIds.length > 0) {
      await db('password_history').whereIn('id', staleIds).del();
    }
  },
};

export default sqliteAuthUserRepository;
