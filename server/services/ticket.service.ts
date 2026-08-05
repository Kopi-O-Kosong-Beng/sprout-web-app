/** Query ticket creation - Req 9, tasks.md 8.1. */
import ticketRepository from '../repositories/tickets';
import { send as sendEmail } from './email.service';
import type { Ticket, TicketInput, TicketStatusView } from '../models/ticket';

interface HttpError extends Error {
  status?: number;
}

/** One message for "no such reference" and for "that reference is not yours".
 *  Telling them apart would turn the form into an oracle for which reference
 *  numbers exist, and SPR-YYYYMMDD-NNNN is trivially guessable. */
const TICKET_NOT_FOUND_MESSAGE =
  'No ticket matches that reference number and email address.';

/** Every ticket, for the superadmin Ticket Manager.
 *
 *  Returns the full record including the message body and the reporter's
 *  contact details — unlike the public status check, this sits behind
 *  requireSuperAdmin, and answering a ticket means reading it. */
export async function listTickets(): Promise<Ticket[]> {
  return ticketRepository.list();
}

export async function setTicketStatus(
  id: string,
  status: Ticket['status']
): Promise<Ticket> {
  const ticket = await ticketRepository.setStatus(id, status);
  if (!ticket) {
    const err = new Error('Ticket not found.') as HttpError;
    err.status = 404;
    throw err;
  }
  return ticket;
}

/** Looks up a ticket for the person who filed it.
 *
 *  Both the reference number and the email must match — the reference alone is
 *  a sequential daily counter, so it is not a secret.
 */
export async function lookupTicketStatus(
  refNumberInput: string,
  emailInput: string
): Promise<TicketStatusView> {
  const refNumber = refNumberInput.trim().toUpperCase();
  const email = emailInput.trim().toLowerCase();
  const ticket = await ticketRepository.findByRefNumber(refNumber);

  if (!ticket || ticket.email.trim().toLowerCase() !== email) {
    const err = new Error(TICKET_NOT_FOUND_MESSAGE) as HttpError;
    err.status = 404;
    throw err;
  }

  return {
    refNumber: ticket.refNumber,
    subject: ticket.subject,
    category: ticket.category,
    status: ticket.status,
    submittedAt: ticket.createdAt ?? null,
    resolvedAt: ticket.resolvedAt ?? null,
  };
}

/** Creates a ticket with a RefNumber `SPR-YYYYMMDD-NNNN` (zero-padded daily
 *  sequence, Req 9.5/9.10 - atomicity handled inside each repo impl). */
export async function createTicket(input: TicketInput): Promise<Ticket> {
  const ticket = await ticketRepository.create(input);
  const adminEmail = process.env.ADMIN_EMAIL ?? 'hello.sprout.team@gmail.com';
  const [submitterResult, adminResult] = await Promise.allSettled([
    sendEmail({
      to: ticket.email,
      subject: `Sprout - we received your query (${ticket.refNumber})`,
      text:
        `Hi ${ticket.name}, thanks for contacting Sprout. ` +
        `Your reference number is ${ticket.refNumber}.\n\n` +
        `Subject: ${ticket.subject}\n`,
    }),
    sendEmail({
      to: adminEmail,
      subject: `New query ticket ${ticket.refNumber} [${ticket.category}] ${ticket.subject}`,
      text:
        `${ticket.name} <${ticket.email}>\n` +
        `Organisation: ${ticket.organisation || '-'}\n` +
        `Inquiry type: ${ticket.category}\n` +
        `Subject: ${ticket.subject}\n\n` +
        `${ticket.message}`,
    }),
  ]);

  const failureCodes = [
    submitterResult.status === 'rejected' ? 'submitter_email_delivery_failed' : null,
    adminResult.status === 'rejected' ? 'admin_email_delivery_failed' : null,
  ].filter((code): code is string => code !== null);
  const lastEmailError = failureCodes.length > 0 ? failureCodes.join(';') : null;

  if (lastEmailError) {
    console.error(
      `[ticket] email delivery failed for ${ticket.refNumber} - logged for manual retry:`,
      lastEmailError
    );
  }

  await ticketRepository.updateNotificationState(ticket.id, {
    submitterEmailStatus: submitterResult.status === 'fulfilled' ? 'sent' : 'failed',
    adminEmailStatus: adminResult.status === 'fulfilled' ? 'sent' : 'failed',
    lastEmailError,
    notificationUpdatedAt: new Date().toISOString(),
  }).catch(() => {
    console.error(
      `[ticket] notification_status_update_failed ref=${ticket.refNumber}`
    );
  });

  return ticket;
}
