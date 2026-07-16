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
  stats: AvatarStats;
  metadata: Record<string, unknown> | null;
}

export interface PaginatedAvatars {
  items: AvatarRecord[];
  page: number;
  pageSize: number;
  total: number;
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

export async function submitTicket(input: TicketInput): Promise<TicketResponse> {
  const { data } = await apiClient.post<TicketResponse>('/api/query/submit', input);
  return data;
}

export async function signupUser(input: SignupInput): Promise<SignupResponse> {
  const { data } = await apiClient.post<SignupResponse>('/api/auth/signup', input);
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
