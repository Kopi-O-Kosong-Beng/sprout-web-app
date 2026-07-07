/** Public query ticket route — Req 9, tasks.md 8.3 */
import { Router } from 'express';
import Joi from 'joi';
import validate from '../middleware/validation.middleware';
import { handleQuerySubmit } from '../controllers/query.controller';
import { TICKET_CATEGORIES } from '../models/ticket';

const router = Router();

const querySchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  email: Joi.string().trim().email().required(),
  category: Joi.string()
    .valid(...TICKET_CATEGORIES)
    .required(), // Req 9.12
  message: Joi.string().trim().min(1).max(2000).required(), // Req 9.11
});

router.post('/submit', validate(querySchema), handleQuerySubmit);

export default router;
