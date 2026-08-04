/** Public query ticket route — Req 9, tasks.md 8.3 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import Joi from 'joi';
import validate from '../middleware/validation.middleware';
import { handleQuerySubmit } from '../controllers/query.controller';
import { TICKET_CATEGORIES } from '../models/ticket';

const router = Router();

/**
 * The only unauthenticated write in the app, and it had nothing in front of it
 * but the global 1000-per-15-minutes ceiling — which is a server-wide budget,
 * not a per-form one, so a single IP could spend the whole allowance filling
 * the ticket collection and emailing the support address. 20 per 15 minutes is
 * far above what a person submitting a contact form does and far below what
 * makes the inbox unusable. Matched to authLimiter's shape, including the
 * raised ceiling under test so suites are not throttled by each other.
 */
const queryLimiter = rateLimit({
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

router.post('/submit', queryLimiter, validate(querySchema), handleQuerySubmit);

export default router;
