/** Query ticket creation — Req 9, tasks.md 8.1.
 *  Persistence goes through the repository seam (repositories/tickets.ts), so
 *  this service is identical on SQLite and Firestore. */
import ticketRepository from '../repositories/tickets';
import { send as sendEmail } from './email.service';
import type { Ticket, TicketInput } from '../models/ticket';

/** Creates a ticket with a RefNumber `SPR-YYYYMMDD-NNNN` (zero-padded daily
 *  sequence, Req 9.5/9.10 — atomicity handled inside each repo impl). */
export async function createTicket(input: TicketInput): Promise<Ticket> {
  const ticket = await ticketRepository.create(input);

  // Req 9.8: email failure must not fail the request — persist, respond, log for retry
  try {
    await sendEmail({
      to: ticket.email,
      subject: `Sprout — we received your query (${ticket.refNumber})`,
      text: `Hi ${ticket.name}, thanks for contacting Sprout. Your reference number is ${ticket.refNumber}.`,
    });
    await sendEmail({
      to: process.env.ADMIN_EMAIL ?? 'team@sprout.local',
      subject: `New query ticket ${ticket.refNumber} [${ticket.category}]`,
      text: `${ticket.name} <${ticket.email}>\n\n${ticket.message}`,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(
      `[ticket] email delivery failed for ${ticket.refNumber} — logged for manual retry:`,
      reason
    );
  }

  return ticket;
}
