import '../env';
import db from '../database/db';
import { getAuthAdmin, getDb } from '../firebase';
import type { AuthUserProfile, PasswordHistoryEntry } from '../models/auth';
import type { AvatarRecord, AvatarStats } from '../models/avatar';

const DEMO_USER_ID = 'demo-user-0001';

export interface ReconciliationInput {
  localProfiles: AuthUserProfile[];
  firebaseAuthUids: Set<string>;
  firestoreProfileUids: Set<string>;
  localAvatars: AvatarRecord[];
  firestoreAvatars: AvatarRecord[];
}

export interface ReconciliationPlan {
  profilesToCreate: AuthUserProfile[];
  profileUidsToCreate: string[];
  profileUidsToSkip: string[];
  orphanProfileUids: string[];
  unmatchedLocalAvatarFingerprints: string[];
  safeToRemoveSqlite: boolean;
}

export type ReconciliationMode = 'dry-run' | 'apply';

export interface ReconciliationDocumentReference {
  id: string;
}

export interface ReconciliationWriteBatch {
  create(reference: ReconciliationDocumentReference, data: unknown): void;
  commit(): Promise<void>;
}

export interface ReconciliationFirestore {
  collection(name: string): { doc(id: string): ReconciliationDocumentReference };
  batch(): ReconciliationWriteBatch;
}

export interface MigrationWriter {
  createProfileWithHistory(
    profile: AuthUserProfile,
    history: PasswordHistoryEntry[]
  ): Promise<void>;
}

export interface ReconciliationExecutionInput {
  mode: ReconciliationMode;
  plan: ReconciliationPlan;
  localPasswordHistory: PasswordHistoryEntry[];
  writer: MigrationWriter;
  output: (message: string) => void;
}

export interface ReconciliationExecutionResult {
  migratedProfileCount: number;
  migratedPasswordHistoryCount: number;
}

export interface ReconciliationSummaryInput {
  mode: ReconciliationMode;
  localProfileCount: number;
  firebaseAuthUserCount: number;
  firestoreProfileCount: number;
  localAvatarCount: number;
  firestoreAvatarCount: number;
  plan: ReconciliationPlan;
}

export function avatarFingerprint(avatar: AvatarRecord): string {
  return JSON.stringify({
    speciesName: avatar.speciesName,
    speciesFamily: avatar.speciesFamily,
    source: avatar.source,
    isTemporary: avatar.isTemporary,
    stats: avatar.stats,
  });
}

function sanitizeProfile(profile: AuthUserProfile): AuthUserProfile {
  return {
    ...profile,
    resetOtpHash: null,
    resetOtpExpiresAt: null,
    resetOtpFailedAttempts: 0,
  };
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function unmatchedFingerprintMultiset(
  localAvatars: AvatarRecord[],
  firestoreAvatars: AvatarRecord[]
): string[] {
  const firestoreCounts = new Map<string, number>();
  firestoreAvatars.forEach((avatar) => {
    const fingerprint = avatarFingerprint(avatar);
    firestoreCounts.set(fingerprint, (firestoreCounts.get(fingerprint) ?? 0) + 1);
  });

  const unmatched: string[] = [];
  localAvatars.forEach((avatar) => {
    const fingerprint = avatarFingerprint(avatar);
    const available = firestoreCounts.get(fingerprint) ?? 0;
    if (available === 0) {
      unmatched.push(fingerprint);
      return;
    }
    firestoreCounts.set(fingerprint, available - 1);
  });

  return unmatched.sort((left, right) => left.localeCompare(right));
}

export function buildReconciliationPlan(input: ReconciliationInput): ReconciliationPlan {
  const profilesToCreate = input.localProfiles
    .filter(
      (profile) =>
        input.firebaseAuthUids.has(profile.id) &&
        !input.firestoreProfileUids.has(profile.id)
    )
    .map(sanitizeProfile)
    .sort((left, right) => left.id.localeCompare(right.id));

  const profileUidsToSkip = sortedUnique(
    input.localProfiles
      .filter(
        (profile) =>
          input.firebaseAuthUids.has(profile.id) &&
          input.firestoreProfileUids.has(profile.id)
      )
      .map((profile) => profile.id)
  );
  const orphanProfileUids = sortedUnique(
    input.localProfiles
      .filter((profile) => !input.firebaseAuthUids.has(profile.id))
      .map((profile) => profile.id)
  );
  const unmatchedLocalAvatarFingerprints = unmatchedFingerprintMultiset(
    input.localAvatars,
    input.firestoreAvatars
  );
  const hasNonDemoAvatarOwner = input.localAvatars.some(
    (avatar) => avatar.userId !== DEMO_USER_ID
  );

  return {
    profilesToCreate,
    profileUidsToCreate: profilesToCreate.map((profile) => profile.id),
    profileUidsToSkip,
    orphanProfileUids,
    unmatchedLocalAvatarFingerprints,
    safeToRemoveSqlite:
      unmatchedLocalAvatarFingerprints.length === 0 && !hasNonDemoAvatarOwner,
  };
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value !== 'string') return null;
  const parsed = JSON.parse(value) as unknown;
  return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
}

function asAvatarStats(value: unknown): AvatarStats {
  const stats = parseJsonObject(value);
  if (!stats) throw new Error('Invalid local avatar stats');
  return {
    hp: Number(stats.hp),
    attack: Number(stats.attack),
    defense: Number(stats.defense),
    speed: Number(stats.speed),
  };
}

function toIso(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return value as null | undefined;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error('Invalid local timestamp');
  return date.toISOString();
}

function toLocalProfile(row: Record<string, unknown>): AuthUserProfile {
  return {
    id: String(row.id),
    email: String(row.email),
    displayName: String(row.displayName),
    isVerified: Boolean(row.isVerified),
    passwordHash: (row.passwordHash as string | null | undefined) ?? null,
    resetOtpHash: (row.resetOtpHash as string | null | undefined) ?? null,
    resetOtpExpiresAt: toIso(row.resetOtpExpiresAt),
    resetOtpFailedAttempts: Number(row.resetOtpFailedAttempts ?? 0),
    lastLogin: (row.lastLogin as string | null | undefined) ?? null,
    lastLogout: (row.lastLogout as string | null | undefined) ?? null,
    createdAt: toIso(row.createdAt) ?? undefined,
    updatedAt: toIso(row.updatedAt) ?? undefined,
  };
}

function toLocalAvatar(row: Record<string, unknown>): AvatarRecord {
  return {
    id: String(row.id),
    userId: String(row.userId),
    speciesName: String(row.speciesName),
    speciesFamily: (row.speciesFamily as string | null | undefined) ?? null,
    spriteUrl: String(row.spriteUrl),
    discoveredAt: toIso(row.discoveredAt) ?? new Date(0).toISOString(),
    source: row.source === 'mobile' ? 'mobile' : 'web',
    isTemporary: Boolean(row.isTemporary),
    expiresAt: toIso(row.expiresAt) ?? null,
    stats: asAvatarStats(row.stats),
    metadata: parseJsonObject(row.metadata),
  };
}

function toFirestoreAvatar(
  id: string,
  data: FirebaseFirestore.DocumentData
): AvatarRecord {
  return {
    ...(data as AvatarRecord),
    id,
    stats: asAvatarStats(data.stats),
    metadata: parseJsonObject(data.metadata),
  };
}

async function listFirebaseAuthUids(): Promise<Set<string>> {
  const auth = getAuthAdmin();
  const uids = new Set<string>();
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    page.users.forEach((user) => uids.add(user.uid));
    pageToken = page.pageToken;
  } while (pageToken);
  return uids;
}

async function readLocalProfiles(): Promise<AuthUserProfile[]> {
  const rows = await db('users').select<Record<string, unknown>[]>('*');
  return rows.map(toLocalProfile);
}

async function readLocalAvatars(): Promise<AvatarRecord[]> {
  const rows = await db('avatar_records').select<Record<string, unknown>[]>('*');
  return rows.map(toLocalAvatar);
}

async function readLocalPasswordHistory(): Promise<PasswordHistoryEntry[]> {
  const rows = await db('password_history').select<PasswordHistoryEntry[]>('*');
  return rows.map((row) => ({
    id: String(row.id),
    userId: String(row.userId),
    passwordHash: String(row.passwordHash),
    changedAt: toIso(row.changedAt) ?? new Date(0).toISOString(),
  }));
}

function formatUids(label: string, uids: string[]): string {
  return `${label}: ${uids.length}${uids.length > 0 ? ` [${uids.join(', ')}]` : ''}`;
}

export function formatReconciliationSummary(
  input: ReconciliationSummaryInput
): string[] {
  return [
    `Reconciliation ${input.mode}`,
    `Local profile count: ${input.localProfileCount}`,
    `Firestore profile count: ${input.firestoreProfileCount}`,
    `Firebase Auth user count: ${input.firebaseAuthUserCount}`,
    `Local avatar count: ${input.localAvatarCount}`,
    `Firestore avatar count: ${input.firestoreAvatarCount}`,
    formatUids('Auth-backed profiles to create', input.plan.profileUidsToCreate),
    formatUids('Existing Firestore profiles skipped', input.plan.profileUidsToSkip),
    formatUids('Orphan local profiles excluded', input.plan.orphanProfileUids),
    `Unmatched local avatar fingerprints: ${input.plan.unmatchedLocalAvatarFingerprints.length}`,
    `Safe to remove SQLite: ${input.plan.safeToRemoveSqlite}`,
  ];
}

export function createFirestoreMigrationWriter(
  firestore: ReconciliationFirestore
): MigrationWriter {
  return {
    async createProfileWithHistory(
      profile: AuthUserProfile,
      history: PasswordHistoryEntry[]
    ): Promise<void> {
      // Batch create keeps the profile and its history all-or-nothing while
      // retaining the create-only precondition of DocumentReference.create.
      const batch = firestore.batch();
      batch.create(firestore.collection('users').doc(profile.id), profile);
      history.forEach((entry) => {
        batch.create(firestore.collection('password_history').doc(entry.id), entry);
      });
      await batch.commit();
    },
  };
}

export async function executeReconciliation(
  input: ReconciliationExecutionInput
): Promise<ReconciliationExecutionResult> {
  if (input.mode === 'dry-run') {
    return { migratedProfileCount: 0, migratedPasswordHistoryCount: 0 };
  }
  if (!input.plan.safeToRemoveSqlite) {
    throw new Error('Apply refused because the SQLite removal safety checks failed.');
  }

  let migratedPasswordHistoryCount = 0;
  for (const profile of input.plan.profilesToCreate) {
    const profileHistory = input.localPasswordHistory.filter(
      (entry) => entry.userId === profile.id
    );
    await input.writer.createProfileWithHistory(profile, profileHistory);
    migratedPasswordHistoryCount += profileHistory.length;
  }

  const result = {
    migratedProfileCount: input.plan.profilesToCreate.length,
    migratedPasswordHistoryCount,
  };
  input.output(`Migrated profile count: ${result.migratedProfileCount}`);
  input.output(`Migrated password-history count: ${result.migratedPasswordHistoryCount}`);
  return result;
}

export function parseMode(args: string[]): ReconciliationMode {
  if (args.length === 0 || (args.length === 1 && args[0] === '--dry-run')) {
    return 'dry-run';
  }
  if (args.length === 1 && args[0] === '--apply') return 'apply';
  throw new Error('Use --dry-run (default) or --apply.');
}

async function run(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const [localProfiles, firebaseAuthUids, firestoreProfiles, localAvatars, firestoreAvatarDocs] =
    await Promise.all([
      readLocalProfiles(),
      listFirebaseAuthUids(),
      getDb().collection('users').get(),
      readLocalAvatars(),
      getDb().collection('avatar_records').get(),
    ]);
  const firestoreProfileUids = new Set(firestoreProfiles.docs.map((document) => document.id));
  const firestoreAvatars = firestoreAvatarDocs.docs.map((document) =>
    toFirestoreAvatar(document.id, document.data())
  );
  const plan = buildReconciliationPlan({
    localProfiles,
    firebaseAuthUids,
    firestoreProfileUids,
    localAvatars,
    firestoreAvatars,
  });

  formatReconciliationSummary({
    mode,
    localProfileCount: localProfiles.length,
    firebaseAuthUserCount: firebaseAuthUids.size,
    firestoreProfileCount: firestoreProfileUids.size,
    localAvatarCount: localAvatars.length,
    firestoreAvatarCount: firestoreAvatars.length,
    plan,
  }).forEach((line) => console.log(line));

  const localPasswordHistory = mode === 'apply' ? await readLocalPasswordHistory() : [];
  await executeReconciliation({
    mode,
    plan,
    localPasswordHistory,
    writer: createFirestoreMigrationWriter(getDb() as unknown as ReconciliationFirestore),
    output: console.log,
  });
  if (mode === 'apply') {
    console.log('Apply completed. Run --dry-run again to verify the postcondition.');
  }
}

if (require.main === module) {
  run()
    .catch(() => {
      console.error('Reconciliation failed. No SQLite data was deleted.');
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.destroy();
    });
}
