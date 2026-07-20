/** Query ticket creation - Req 9, tasks.md 8.1.
 *  Persistence goes through the repository seam (repositories/tickets.ts), so
 *  this service is identical on SQLite and Firestore. */
import ticketRepository from '../repositories/tickets';
import { send as sendEmail } from './email.service';
import type { Ticket, TicketInput } from '../models/ticket';

/** Creates a ticket with a RefNumber `SPR-YYYYMMDD-NNNN` (zero-padded daily
 *  sequence, Req 9.5/9.10 - atomicity handled inside each repo impl). */
export async function createTicket(input: TicketInput): Promise<Ticket> {
  const ticket = await ticketRepository.create(input);
  const adminEmail = process.env.ADMIN_EMAIL ?? 'hello.sprout.team@gmail.com';
  const [submitterResult, adminResult] = await Promise.allSettled([
    sendEmail({
      to: ticket.email,
      subject: `Sprout - we received your query (${ticket.refNumber})`,
      text: `Hi ${ticket.name}, thanks for contacting Sprout. Your reference number is ${ticket.refNumber}.`,
    }),
    sendEmail({
      to: adminEmail,
      subject: `New query ticket ${ticket.refNumber} [${ticket.category}]`,
      text: `${ticket.name} <${ticket.email}>\n\n${ticket.message}`,
    }),
  ]);

  const failures = [submitterResult, adminResult]
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => result.reason instanceof Error ? result.reason.message : 'Unknown delivery error');
  const lastEmailError = failures.length > 0 ? failures.join('; ').slice(0, 500) : null;

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
  }).catch((error: unknown) => {
    console.error(
      `[ticket] notification status update failed for ${ticket.refNumber}`,
      error instanceof Error ? error.message : 'Unknown persistence error'
    );
  });

  return ticket;
}
