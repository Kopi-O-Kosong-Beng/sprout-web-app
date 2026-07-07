/** Query ticket controller — Req 9.9, tasks.md 8.2 */
const ticketService = require('../services/ticket.service');

async function handleQuerySubmit(req, res, next) {
  try {
    const ticket = await ticketService.createTicket(req.body);
    res.status(201).json({ refNumber: ticket.refNumber });
  } catch (err) {
    next(err);
  }
}

module.exports = { handleQuerySubmit };
