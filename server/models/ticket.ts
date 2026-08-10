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
  /** When an operator marked this resolved — the moment Sprout replied, as far
   *  as the submitter is concerned. Null while open, and cleared again on
   *  reopen so a ticket back in the queue cannot still claim a reply date.
   *
   *  Absent on tickets resolved before this was tracked; the status check then
   *  reports the state without a date rather than inventing one. */
  resolvedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TicketNotificationPatch {
  submitterEmailStatus: DeliveryStatus;
  adminEmailStatus: DeliveryStatus;
  lastEmailError: string | null;
  notificationUpdatedAt: string;
}

/** What a submitter is told when they check a reference number.
 *
 *  Deliberately not the whole Ticket: the stored record carries the message
 *  body, the reporter's name and the email delivery bookkeeping, and this is
 *  returned on an unauthenticated endpoint. Only what the person who filed it
 *  needs to confirm it is being handled.
 */
export interface TicketStatusView {
  refNumber: string;
  subject: string;
  category: TicketCategory;
  status: 'open' | 'resolved';
  submittedAt: string | null;
  resolvedAt: string | null;
}

/** Services depend on this interface rather than Firebase Admin directly. */
export interface TicketRepository {
  create(input: TicketInput): Promise<Ticket>;
  findByRefNumber(refNumber: string): Promise<Ticket | null>;
  /** Newest first, for the superadmin Ticket Manager. */
  list(): Promise<Ticket[]>;
  setStatus(id: string, status: Ticket['status']): Promise<Ticket | null>;
  updateNotificationState(id: string, patch: TicketNotificationPatch): Promise<void>;
}
