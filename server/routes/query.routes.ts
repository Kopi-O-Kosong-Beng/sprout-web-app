/** Public query ticket route — Req 9, tasks.md 8.3 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import Joi from 'joi';
import validate from '../middleware/validation.middleware';
import { handleQueryStatus, handleQuerySubmit } from '../controllers/query.controller';
import { TICKET_CATEGORIES } from '../models/ticket';

const router = Router();

/**
 * Submit is the only unauthenticated write in the app, and it had nothing in
 * front of it but the global 1000-per-15-minutes ceiling — which is a
 * server-wide budget, not a per-form one, so a single IP could spend the whole
 * allowance filling the ticket collection and emailing the support address. 20
 * per 15 minutes is far above what a person submitting a contact form does and
 * far below what makes the inbox unusable. Matched to authLimiter's shape,
 * including the raised ceiling under test so suites are not throttled by each
 * other.
 */
const queryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
});

/** The status form is unauthenticated and takes a guessable reference number,
 *  so it is capped rather than left open to a scripted sweep of the day's
 *  sequence against a known address. Its own bucket, not queryLimiter's: a
 *  sweep of status lookups must not spend the budget that lets a real person
 *  file a ticket. */
const statusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// Field set per UC8 step 1: name, email, organisation (optional), subject,
// message, inquiry type.
/* Exported so the text fuzz harness can drive the REAL schema rather than a
   copy of it. A harness that fuzzed a reimplementation would prove nothing
   about what the route actually accepts. */
export const querySchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  // allowUnicode: false — Joi's default accepts internationalized addresses
  // ("tëst🌱@exãmple.com"), which persisted tickets whose confirmation email
  // could never be delivered. ASCII-only matches the rest of the account
  // policy (password, display name) until EAI delivery is actually supported.
  email: Joi.string().trim().email({ allowUnicode: false }).required(),
  organisation: Joi.string().trim().max(120).allow('').optional(),
  subject: Joi.string().trim().min(1).max(150).required(),
  category: Joi.string()
    .valid(...TICKET_CATEGORIES)
    .required(), // Req 9.12
  message: Joi.string().trim().min(1).max(2000).required(), // Req 9.11
});

/** SPR-YYYYMMDD-NNNN, accepted in any case and trimmed by the service. */
export const statusSchema = Joi.object({
  refNumber: Joi.string()
    .trim()
    .pattern(/^[Ss][Pp][Rr]-\d{8}-\d{4}$/)
    .required()
    .messages({ 'string.pattern.base': 'Reference number must look like SPR-20260712-0001.' }),
  email: Joi.string().trim().email({ allowUnicode: false }).required(),
});

router.post('/submit', queryLimiter, validate(querySchema), handleQuerySubmit);
router.post('/status', statusLimiter, validate(statusSchema), handleQueryStatus);

export default router;
