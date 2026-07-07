/** Public query ticket route — Req 9, tasks.md 8.3 */
const express = require('express');
const Joi = require('joi');
const validate = require('../middleware/validation.middleware');
const { handleQuerySubmit } = require('../controllers/query.controller');
const { CATEGORIES } = require('../services/ticket.service');

const router = express.Router();

const querySchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  email: Joi.string().trim().email().required(),
  category: Joi.string()
    .valid(...CATEGORIES)
    .required(), // Req 9.12
  message: Joi.string().trim().min(1).max(2000).required(), // Req 9.11
});

router.post('/submit', validate(querySchema), handleQuerySubmit);

module.exports = router;
