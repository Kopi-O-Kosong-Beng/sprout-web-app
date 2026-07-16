import { randomUUID } from 'crypto';
import db from '../database/db';
import { buildAuditTimestamp } from '../utils/audit-timestamp';
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
    lastLogin: (row.lastLogin as string | null | undefined) ?? null,
    lastLogout: (row.lastLogout as string | null | undefined) ?? null,
    createdAt: row.createdAt ? new Date(row.createdAt as string).toISOString() : undefined,
    updatedAt: row.updatedAt ? new Date(row.updatedAt as string).toISOString() : undefined,
  };
}

function loginAuditFields(signedInAt?: string | null) {
  const source = signedInAt ? new Date(signedInAt) : new Date();
  const stamp = buildAuditTimestamp(
    Number.isNaN(source.getTime()) ? new Date() : source
  );
  return {
    lastLogin: stamp.readable,
    updatedAt: stamp.iso,
  };
}

function logoutAuditFields() {
  const stamp = buildAuditTimestamp();
  return {
    lastLogout: stamp.readable,
    updatedAt: stamp.iso,
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

  async getByDisplayName(displayName: string): Promise<AuthUserProfile | null> {
    const key = displayName.trim().toLowerCase();
    const row = await db('users')
      .whereRaw('lower(displayName) = ?', [key])
      .first();
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

  async recordLogin(
    id: string,
    signedInAt?: string | null
  ): Promise<AuthUserProfile | null> {
    await db('users').where({ id }).update(loginAuditFields(signedInAt));
    return this.getById(id);
  },

  async recordLogout(id: string): Promise<AuthUserProfile | null> {
    await db('users').where({ id }).update(logoutAuditFields());
    return this.getById(id);
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
