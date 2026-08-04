import apiClient from './apiClient';

export interface HealthResponse {
  status: string;
  timestamp: string;
}

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
  source: 'mobile' | 'web';
  isTemporary: boolean;
  expiresAt: string | null;
  battleEligible: boolean;
  stats: AvatarStats;
  metadata: Record<string, unknown> | null;
}

export interface PaginatedAvatars {
  items: AvatarRecord[];
  page: number;
  pageSize: number;
  total: number;
}

export type BattleStatus = 'active' | 'won' | 'lost' | 'abandoned';
export type BattlePhase =
  | 'PREPARE_BOT_INTENT'
  | 'PLAYER_ACTION'
  | 'RESOLVE_ROUND'
  | 'CHECK_RESULT'
  | 'TERMINAL';
export type BattleMoveKind = 'quick' | 'guard' | 'signature' | 'heal';
export type BattleIntent = 'building' | 'committed' | 'uncertain';
export type BattleActor = 'player' | 'bot' | 'system';
export type BattleEventType =
  | 'battle_started'
  | 'bot_intent_prepared'
  | 'move_used'
  | 'move_missed'
  | 'damage_dealt'
  | 'healed'
  | 'player_action_skipped'
  | 'bot_action_skipped'
  | 'battle_won'
  | 'battle_lost'
  | 'battle_abandoned';

export interface BattleMove {
  id: string;
  name: string;
  kind: BattleMoveKind;
  power: number;
  accuracy: number;
  energyGain: number;
  energyCost: number;
}

export interface BattlePlayer {
  id: string;
  name: string;
  spriteUrl: string;
  stats: AvatarStats;
  currentHp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  healUsed: boolean;
  moves: BattleMove[];
}

export interface BattleBot {
  id: string;
  name: string;
  spriteUrl: string;
  stats: AvatarStats;
  currentHp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  healUsed: boolean;
}

interface BattleEventBase {
  turnNumber: number;
  type: BattleEventType;
  message: string;
  amount?: number;
}

export interface BotBattleEvent extends BattleEventBase {
  actor: 'bot';
  intent?: BattleIntent;
}

export interface PlayerBattleEvent extends BattleEventBase {
  actor: 'player';
  moveId?: string;
}

export interface SystemBattleEvent extends BattleEventBase {
  actor: 'system';
}

export type BattleEvent =
  | BotBattleEvent
  | PlayerBattleEvent
  | SystemBattleEvent;

export interface BattleSession {
  id: string;
  avatarId: string;
  status: BattleStatus;
  phase: BattlePhase;
  turnNumber: number;
  player: BattlePlayer;
  bot: BattleBot;
  botIntent: BattleIntent | null;
  log: BattleEvent[];
  xpAwarded: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface BattleActionResult {
  session: BattleSession;
  stale: boolean;
}

/** Inquiry types offered by the Contact Us form (UC8 step 1). Labels are
 *  shown to the user; values are what the API accepts. */
export const TICKET_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'technical_support', label: 'Technical Support' },
  { value: 'feedback', label: 'Feedback' },
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number]['value'];

export interface TicketInput {
  name: string;
  email: string;
  organisation?: string;
  subject: string;
  category: TicketCategory;
  message: string;
}

export interface TicketResponse {
  refNumber: string;
}

export interface SignupInput {
  email: string;
  password: string;
  displayName: string;
}

export interface SignupResponse {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  verificationEmailSent: boolean;
  message: string;
}

export interface VerificationEmailResponse {
  verificationEmailSent: boolean;
  message: string;
}

export interface AuthProfile {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  /** Server-computed from its ADMIN_EMAILS allowlist. Decides where login lands
   *  and whether the Admin nav link appears — it is not a permission. /api/admin
   *  re-checks the allowlist on every request and answers 403 regardless. */
  isAdmin: boolean;
  lastLogin?: string | null;
  lastLogout?: string | null;
}

export interface MessageResponse {
  message: string;
}

export async function checkHealth(): Promise<HealthResponse> {
  const { data } = await apiClient.get<HealthResponse>('/api/health');
  return data;
}

export async function listAvatars(
  devUid: string,
  page = 1,
  pageSize = 20
): Promise<PaginatedAvatars> {
  const { data } = await apiClient.get<PaginatedAvatars>('/api/avatar', {
    params: { page, pageSize },
    headers: { 'x-dev-uid': devUid },
  });
  return data;
}

export async function listAvatarsWithToken(
  idToken: string,
  page = 1,
  pageSize = 20
): Promise<PaginatedAvatars> {
  const { data } = await apiClient.get<PaginatedAvatars>('/api/avatar', {
    params: { page, pageSize },
    headers: { Authorization: `Bearer ${idToken}` },
  });
  return data;
}

export async function listOwnedAvatars(
  page = 1,
  pageSize = 20
): Promise<PaginatedAvatars> {
  const { data } = await apiClient.get<PaginatedAvatars>('/api/avatar', {
    params: { page, pageSize },
  });
  return data;
}

/** What the Scan screen banks after a run: the identification, the finished
 *  sprite, and the details worth keeping. Stats are the server's to derive. */
export interface NewAvatarInput {
  speciesName: string;
  speciesFamily?: string | null;
  /** The finished 192x192 PNG, as `data:image/png;base64,...`. */
  spriteDataUrl: string;
  /** The photo it was made from, downscaled, as `data:image/jpeg;base64,...`. */
  photoDataUrl?: string;
  /**
   * How it was captured, which decides how long it lives: `mobile` is an IRL
   * camera scan and is kept, `web` is a file upload and expires in 24 hours.
   */
  source: 'mobile' | 'web';
  metadata?: {
    taxonomy?: Record<string, string>;
    commonNames?: string[];
    description?: string;
    confidence?: number;
  };
}

/** Saves a scanned plant into the caller's archive (POST /api/avatar → 201). */
export async function createAvatar(
  input: NewAvatarInput
): Promise<AvatarRecord> {
  const { data } = await apiClient.post<AvatarRecord>('/api/avatar', input);
  return data;
}

/** Removes one owned avatar for good (DELETE /api/avatar/:id → 204).
 *  The archive's shovel; the server answers 404 for anyone else's record. */
export async function deleteAvatar(avatarId: string): Promise<void> {
  await apiClient.delete(`/api/avatar/${encodeURIComponent(avatarId)}`);
}

export async function setDemoAvatars(
  enabled: boolean
): Promise<PaginatedAvatars> {
  const response = enabled
    ? await apiClient.post<PaginatedAvatars>('/api/avatar/demo')
    : await apiClient.delete<PaginatedAvatars>('/api/avatar/demo');
  return response.data;
}

export type AlmanacStatus = 'common' | 'naturalised' | 'casual';

/** A card as the public landing page sees it: no finder, no date, no photo. */
export interface AlmanacEntry {
  id: string;
  speciesName: string;
  commonName: string | null;
  family: string;
  status: AlmanacStatus;
  origin: string | null;
  growthForm: string | null;
  discovered: boolean;
  discoveryCount: number;
}

/**
 * One species opened up.
 *
 * The sprite, stats and botanical record come back for anyone — they describe
 * the plant. The three optional fields describe the *person* who found it and
 * are present only when the request carried a login.
 */
export interface AlmanacEntryDetail extends AlmanacEntry {
  spriteUrl: string | null;
  stats: AvatarStats | null;
  description: string | null;
  commonNames: string[];
  taxonomy: Record<string, string>;
  confidence: number | null;
  discoveredByName?: string | null;
  discoveredAt?: string | null;
  photoUrl?: string | null;
}

export interface AlmanacSummary {
  source: string;
  total: number;
  discovered: number;
  species: AlmanacEntry[];
}

export interface AdminAlmanac extends Omit<AlmanacSummary, 'species'> {
  species: AlmanacEntryDetail[];
  offTaxonomy: Array<{
    speciesId: string;
    speciesName: string;
    discoveredByName: string;
    discoveredAt: string;
    discoveryCount: number;
  }>;
}

/** Public — no Authorization header required (GET /api/almanac). */
export async function getAlmanac(): Promise<AlmanacSummary> {
  const { data } = await apiClient.get<AlmanacSummary>('/api/almanac');
  return data;
}

/** Public. A signed-in caller additionally gets the finder, date and photo. */
export async function getAlmanacEntry(
  speciesId: string
): Promise<AlmanacEntryDetail> {
  const { data } = await apiClient.get<AlmanacEntryDetail>(
    `/api/almanac/${encodeURIComponent(speciesId)}`
  );
  return data;
}

export async function getAdminAlmanac(): Promise<AdminAlmanac> {
  const { data } = await apiClient.get<AdminAlmanac>('/api/admin/almanac');
  return data;
}

export interface CleanupReport {
  target: string;
  dryRun: boolean;
  matched: number;
  deleted: number;
  sample: Array<{ id: string; label: string; detail: string }>;
  ranAt: string;
}

/**
 * Runs an admin cleanup target. Dry run unless `confirmTarget` is passed, which
 * the server also insists on — one accidental click cannot delete anything.
 */
export async function runAdminCleanup(
  target: string,
  options: { dryRun: boolean } = { dryRun: true }
): Promise<CleanupReport> {
  const { data } = await apiClient.post<CleanupReport>('/api/admin/cleanup', {
    target,
    dryRun: options.dryRun,
    ...(options.dryRun ? {} : { confirmTarget: target }),
  });
  return data;
}

export interface ApiProbe {
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
  /** null when the provider was deliberately not probed — Flux and withoutBG
   *  bill per call, so the health page reports "key present, liveness unknown"
   *  rather than spending a credit on every page load. */
  latencyMs?: number | null;
  remainingCredits?: number | null;
  limit?: number | null;
  used?: number | null;
  detail: string;
  model?: string;
}

export interface ApiHealth {
  timestamp: string;
  overallStatus: 'HEALTHY' | 'DEGRADED';
  probes: Record<string, ApiProbe>;
}

/** Live provider probes. Admin-only, same ADMIN_EMAILS gate as /api/admin. */
export async function getApiHealth(): Promise<ApiHealth> {
  const { data } = await apiClient.get<ApiHealth>('/api/platform/health-check');
  return data;
}

export async function startPveBattle(avatarId: string): Promise<BattleSession> {
  const { data } = await apiClient.post<BattleSession>('/api/battle/pve/start', {
    avatarId,
  });
  return data;
}

export async function getPveBattle(sessionId: string): Promise<BattleSession> {
  const { data } = await apiClient.get<BattleSession>(
    `/api/battle/pve/${sessionId}`
  );
  return data;
}

export async function submitPveAction(
  sessionId: string,
  moveId: string,
  expectedTurn: number
): Promise<BattleActionResult> {
  const { data } = await apiClient.post<BattleActionResult>(
    `/api/battle/pve/${sessionId}/action`,
    { moveId, expectedTurn }
  );
  return data;
}

export async function abandonPveBattle(
  sessionId: string
): Promise<BattleSession> {
  const { data } = await apiClient.post<BattleSession>(
    `/api/battle/pve/${sessionId}/abandon`
  );
  return data;
}

export async function submitTicket(input: TicketInput): Promise<TicketResponse> {
  const { data } = await apiClient.post<TicketResponse>('/api/query/submit', input);
  return data;
}

export async function signupUser(input: SignupInput): Promise<SignupResponse> {
  const { data } = await apiClient.post<SignupResponse>('/api/auth/signup', input);
  return data;
}

export async function resendVerification(): Promise<VerificationEmailResponse> {
  const { data } = await apiClient.post<VerificationEmailResponse>(
    '/api/auth/resend-verification'
  );
  return data;
}

export async function getCurrentUser(idToken?: string): Promise<AuthProfile> {
  // Without an explicit token the apiClient request interceptor attaches the
  // signed-in Firebase user's token automatically.
  const { data } = await apiClient.get<AuthProfile>('/api/auth/me', {
    headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
  });
  return data;
}

export async function recordSessionLogin(idToken?: string): Promise<AuthProfile> {
  const { data } = await apiClient.post<AuthProfile>(
    '/api/auth/session/login',
    undefined,
    { headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined }
  );
  return data;
}

export async function recordSessionLogout(idToken?: string): Promise<AuthProfile> {
  const { data } = await apiClient.post<AuthProfile>(
    '/api/auth/session/logout',
    undefined,
    { headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined }
  );
  return data;
}

export interface AdminAccount {
  id: string;
  email: string;
  displayName: string;
  isVerified: boolean;
  isAdmin: boolean;
  pveXp: number;
  pveWins: number;
  pveLosses: number;
  createdAt: string | null;
  lastLogin: string | null;
}

export interface AdminAccountList {
  items: AdminAccount[];
  total: number;
}

export interface DeleteAccountResult {
  id: string;
  firebaseIdentityDeleted: boolean;
  profileDeleted: boolean;
}

/** Admin-only: 403 for anyone outside the server's ADMIN_EMAILS allowlist. */
export async function listAdminAccounts(): Promise<AdminAccountList> {
  const { data } = await apiClient.get<AdminAccountList>('/api/admin/users');
  return data;
}

export async function deleteAdminAccount(uid: string): Promise<DeleteAccountResult> {
  const { data } = await apiClient.delete<DeleteAccountResult>(
    `/api/admin/users/${encodeURIComponent(uid)}`
  );
  return data;
}

export async function requestPasswordReset(email: string): Promise<MessageResponse> {
  const { data } = await apiClient.post<MessageResponse>('/api/auth/request-reset', {
    email,
  });
  return data;
}

export async function verifyPasswordReset(input: {
  email: string;
  otp: string;
  newPassword: string;
}): Promise<MessageResponse> {
  const { data } = await apiClient.post<MessageResponse>(
    '/api/auth/verify-reset',
    input
  );
  return data;
}
