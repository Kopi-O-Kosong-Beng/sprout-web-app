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

export const TICKET_CATEGORIES = [
  'general',
  'bug',
  'billing',
  'partnership',
  'other',
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export interface TicketInput {
  name: string;
  email: string;
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

export async function setDemoAvatars(
  enabled: boolean
): Promise<PaginatedAvatars> {
  const response = enabled
    ? await apiClient.post<PaginatedAvatars>('/api/avatar/demo')
    : await apiClient.delete<PaginatedAvatars>('/api/avatar/demo');
  return response.data;
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
