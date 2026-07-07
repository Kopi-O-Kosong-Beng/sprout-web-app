/** Joi schema validation at the controller boundary — Req 11.1, tasks.md 3.2 */
import type { RequestHandler } from 'express';
import type { ObjectSchema } from 'joi';

const validate = (schema: ObjectSchema): RequestHandler => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    res.status(400).json({ error: error.details.map((d) => d.message).join('; ') });
    return;
  }
  req.body = value;
  next();
};

export default validate;
