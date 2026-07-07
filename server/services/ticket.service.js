/** Query ticket creation — Req 9, tasks.md 8.1.
 *  Persistence goes through the repository seam (repositories/tickets.js), so
 *  this service is identical on SQLite and Firestore. */
const ticketRepo = require('../repositories/tickets');
const emailService = require('./email.service');

const CATEGORIES = ['general', 'bug', 'billing', 'partnership', 'other'];

/** Creates a ticket with a RefNumber `SPR-YYYYMMDD-NNNN` (zero-padded daily
 *  sequence, Req 9.5/9.10 — atomicity handled inside each repo impl). */
async function createTicket({ name, email, category, message }) {
  const ticket = await ticketRepo.create({ name, email, category, message });

  // Req 9.8: email failure must not fail the request — persist, respond, log for retry
  try {
    await emailService.send({
      to: email,
      subject: `Sprout — we received your query (${ticket.refNumber})`,
      text: `Hi ${name}, thanks for contacting Sprout. Your reference number is ${ticket.refNumber}.`,
    });
    await emailService.send({
      to: process.env.ADMIN_EMAIL || 'team@sprout.local',
      subject: `New query ticket ${ticket.refNumber} [${category}]`,
      text: `${name} <${email}>\n\n${message}`,
    });
  } catch (err) {
    console.error(
      `[ticket] email delivery failed for ${ticket.refNumber} — logged for manual retry:`,
      err.message
    );
  }

  return ticket;
}

module.exports = { createTicket, CATEGORIES };
