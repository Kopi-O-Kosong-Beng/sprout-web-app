import apiClient from './apiClient';

// Mirrors server/models/avatar.ts and server/models/ticket.ts — keep in sync
// with the backend if those interfaces change.

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

export async function checkHealth(): Promise<HealthResponse> {
  const { data } = await apiClient.get<HealthResponse>('/api/health');
  return data;
}

/** GET /api/avatar — protected route. devUid is sent as x-dev-uid, the
 *  AUTH_DEV_BYPASS escape hatch in auth.middleware.ts (local/dev only). */
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

/** POST /api/query/submit — public route, no auth required. */
export async function submitTicket(input: TicketInput): Promise<TicketResponse> {
  const { data } = await apiClient.post<TicketResponse>('/api/query/submit', input);
  return data;
}
