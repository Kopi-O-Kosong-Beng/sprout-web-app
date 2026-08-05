/** Public query ticket route — Req 9, tasks.md 8.3 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import Joi from 'joi';
import validate from '../middleware/validation.middleware';
import { handleQueryStatus, handleQuerySubmit } from '../controllers/query.controller';
import { TICKET_CATEGORIES } from '../models/ticket';

const router = Router();

/** The status form is unauthenticated and takes a guessable reference number,
 *  so it is capped rather than left open to a scripted sweep of the day's
 *  sequence against a known address. */
const statusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// Field set per UC8 step 1: name, email, organisation (optional), subject,
// message, inquiry type.
const querySchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  email: Joi.string().trim().email().required(),
  organisation: Joi.string().trim().max(120).allow('').optional(),
  subject: Joi.string().trim().min(1).max(150).required(),
  category: Joi.string()
    .valid(...TICKET_CATEGORIES)
    .required(), // Req 9.12
  message: Joi.string().trim().min(1).max(2000).required(), // Req 9.11
});

/** SPR-YYYYMMDD-NNNN, accepted in any case and trimmed by the service. */
const statusSchema = Joi.object({
  refNumber: Joi.string()
    .trim()
    .pattern(/^[Ss][Pp][Rr]-\d{8}-\d{4}$/)
    .required()
    .messages({ 'string.pattern.base': 'Reference number must look like SPR-20260712-0001.' }),
  email: Joi.string().trim().email().required(),
});

router.post('/submit', validate(querySchema), handleQuerySubmit);
router.post('/status', statusLimiter, validate(statusSchema), handleQueryStatus);

export default router;
