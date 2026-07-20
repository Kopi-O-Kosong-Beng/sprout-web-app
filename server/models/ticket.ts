/** Query ticket domain model — Req 9. */

export const TICKET_CATEGORIES = [
  'general',
  'bug',
  'billing',
  'partnership',
  'other',
] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type DeliveryStatus = 'pending' | 'sent' | 'failed';

export interface TicketInput {
  name: string;
  email: string;
  category: TicketCategory;
  message: string;
}

export interface Ticket extends TicketInput {
  id: string;
  /** Format SPR-YYYYMMDD-NNNN, unique per calendar day (Req 9.5/9.10) */
  refNumber: string;
  status: 'open' | 'resolved';
  submitterEmailStatus?: DeliveryStatus;
  adminEmailStatus?: DeliveryStatus;
  lastEmailError?: string | null;
  notificationUpdatedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TicketNotificationPatch {
  submitterEmailStatus: DeliveryStatus;
  adminEmailStatus: DeliveryStatus;
  lastEmailError: string | null;
  notificationUpdatedAt: string;
}

/** The seam every datastore implementation must satisfy — services depend on
 *  this interface, never on Knex or Firestore directly. */
export interface TicketRepository {
  create(input: TicketInput): Promise<Ticket>;
  updateNotificationState(id: string, patch: TicketNotificationPatch): Promise<void>;
}
