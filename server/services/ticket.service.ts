/** Query ticket creation - Req 9, tasks.md 8.1. */
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
