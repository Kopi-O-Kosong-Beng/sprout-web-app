/** Query ticket controller — Req 9.9, tasks.md 8.2 */
import type { RequestHandler } from 'express';
import { createTicket } from '../services/ticket.service';

export const handleQuerySubmit: RequestHandler = async (req, res, next) => {
  try {
    const ticket = await createTicket(req.body);
    res.status(201).json({ refNumber: ticket.refNumber });
  } catch (err) {
    next(err);
  }
};
