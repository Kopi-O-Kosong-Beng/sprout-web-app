/** Joi schema validation at the controller boundary — Req 11.1, tasks.md 3.2 */
const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    return res
      .status(400)
      .json({ error: error.details.map((d) => d.message).join('; ') });
  }
  req.body = value;
  return next();
};

module.exports = validate;
