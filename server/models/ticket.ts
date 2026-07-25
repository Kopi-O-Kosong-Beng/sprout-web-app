/** Query ticket domain model — Req 9. */

/** Inquiry types from the UC8 use-case description and sequence diagram.
 *  The legacy values (`bug`, `billing`, `other`) stay accepted so tickets
 *  stored before the form was realigned remain valid; the UI offers only the
 *  four documented types. */
export const TICKET_CATEGORIES = [
  'general',
  'partnership',
  'technical_support',
  'feedback',
  'bug',
  'billing',
  'other',
] as const;

/** The subset offered in the Contact Us dropdown (UC8 step 1). */
export const TICKET_INQUIRY_TYPES = [
  'general',
  'partnership',
  'technical_support',
  'feedback',
] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type DeliveryStatus = 'pending' | 'sent' | 'failed';

export interface TicketInput {
  name: string;
  email: string;
  /** Optional per UC8: organisations identify themselves, individuals need not. */
  organisation?: string;
  subject: string;
  category: TicketCategory;
  message: string;
}

export interface Ticket extends TicketInput {
  id: string;
  /** Format SPR-YYYYMMDD-NNNN, unique per calendar day (Req 9.5/9.10) */
  refNumber: string;
  status: 'open' | 'resolved';
  submitterEmailStatus: DeliveryStatus;
  adminEmailStatus: DeliveryStatus;
  lastEmailError: string | null;
  notificationUpdatedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TicketNotificationPatch {
  submitterEmailStatus: DeliveryStatus;
  adminEmailStatus: DeliveryStatus;
  lastEmailError: string | null;
  notificationUpdatedAt: string;
}

/** Services depend on this interface rather than Firebase Admin directly. */
export interface TicketRepository {
  create(input: TicketInput): Promise<Ticket>;
  updateNotificationState(id: string, patch: TicketNotificationPatch): Promise<void>;
}
