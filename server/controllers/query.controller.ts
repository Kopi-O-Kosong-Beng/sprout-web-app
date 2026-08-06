/** Query ticket controller — Req 9.9, tasks.md 8.2 */
import type { RequestHandler } from 'express';
import { createTicket, lookupTicketStatus } from '../services/ticket.service';

export const handleQuerySubmit: RequestHandler = async (req, res, next) => {
  try {
    const ticket = await createTicket(req.body);
    res.status(201).json({ refNumber: ticket.refNumber });
  } catch (err) {
    next(err);
  }
};

/** Public status check for the Contact page — the submitter proves ownership
 *  with the email they filed under, so no account is required. */
export const handleQueryStatus: RequestHandler = async (req, res, next) => {
  try {
    res.status(200).json(await lookupTicketStatus(req.body.refNumber, req.body.email));
  } catch (err) {
    next(err);
  }
};
