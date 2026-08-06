import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import Joi, { type ObjectSchema } from 'joi';
import {
  handleAbandonPve,
  handleGetPve,
  handlePveAction,
  handleStartPve,
} from '../controllers/battle.controller';
import authMiddleware from '../middleware/auth.middleware';

const BATTLE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const PRODUCTION_BATTLE_START_LIMIT_MAX = 10;
export const PRODUCTION_BATTLE_ACTION_LIMIT_MAX = 60;
/** Leaving is once per battle, so this only has to outpace honest use — it is
 *  a loop guard, not a budget the player can spend on playing. */
export const PRODUCTION_BATTLE_ABANDON_LIMIT_MAX = 30;

export interface BattleRouterOptions {
  startLimitMax?: number;
  actionLimitMax?: number;
  abandonLimitMax?: number;
}

type ValidatedTarget = 'body' | 'params';

const idSchema = Joi.string()
  .trim()
  .min(1)
  .max(128)
  .pattern(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
  .required();

const startSchema = Joi.object({ avatarId: idSchema }).unknown(false).strict();
const sessionParamsSchema = Joi.object({ sessionId: idSchema })
  .unknown(false)
  .strict();
const actionSchema = Joi.object({
  moveId: Joi.string()
    .trim()
    .min(1)
    .max(64)
    .pattern(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
    .required(),
  expectedTurn: Joi.number().integer().min(1).required(),
})
  .unknown(false)
  .strict();
const emptyBodySchema = Joi.object({}).max(0).unknown(false).strict();

function strictValidate(
  target: ValidatedTarget,
  schema: ObjectSchema
): RequestHandler {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[target], {
      abortEarly: false,
      allowUnknown: false,
      convert: false,
    });
    if (error) {
      res.status(400).json({
        error: error.details.map((detail) => detail.message).join('; '),
      });
      return;
    }
    req[target] = value;
    next();
  };
}

function rateLimitMax(testOverride: number | undefined, productionMax: number): number {
  if (process.env.NODE_ENV !== 'test' || testOverride === undefined) {
    return productionMax;
  }
  if (!Number.isSafeInteger(testOverride) || testOverride < 1) {
    throw new Error('Battle test rate limit must be a positive integer.');
  }
  return testOverride;
}

function battleLimiter(max: number, message: string): RequestHandler {
  return rateLimit({
    windowMs: BATTLE_LIMIT_WINDOW_MS,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user!.uid,
    handler: (_req, res) => res.status(429).json({ error: message }),
  });
}

export function createBattleRouter(options: BattleRouterOptions = {}): Router {
  const router = Router();
  const startLimiter = battleLimiter(
    rateLimitMax(options.startLimitMax, PRODUCTION_BATTLE_START_LIMIT_MAX),
    'Too many battle starts. Please try again later.'
  );
  const actionLimiter = battleLimiter(
    rateLimitMax(options.actionLimitMax, PRODUCTION_BATTLE_ACTION_LIMIT_MAX),
    'Too many battle actions. Please try again later.'
  );
  /*
   * Abandon gets its own budget.
   *
   * It used to share actionLimiter, which is keyed by uid — so a player who
   * spent that budget on moves could no longer abandon either, and the only
   * two controls a battle has were exhausted together. That is a player stuck
   * in a session with no way out but waiting the window down.
   *
   * Leaving is also not the thing the limiter exists to bound: the concern is
   * move spam against the engine, and a player can only abandon a battle they
   * are in, once. A small separate budget keeps the exit open while still
   * refusing a loop.
   */
  const abandonLimiter = battleLimiter(
    rateLimitMax(options.abandonLimitMax, PRODUCTION_BATTLE_ABANDON_LIMIT_MAX),
    'Too many attempts to leave a battle. Please try again later.'
  );

  router.use(authMiddleware);
  router.post(
    '/start',
    strictValidate('body', startSchema),
    startLimiter,
    handleStartPve
  );
  router.get(
    '/:sessionId',
    strictValidate('params', sessionParamsSchema),
    handleGetPve
  );
  router.post(
    '/:sessionId/action',
    strictValidate('params', sessionParamsSchema),
    strictValidate('body', actionSchema),
    actionLimiter,
    handlePveAction
  );
  router.post(
    '/:sessionId/abandon',
    strictValidate('params', sessionParamsSchema),
    strictValidate('body', emptyBodySchema),
    abandonLimiter,
    handleAbandonPve
  );
  return router;
}

export default createBattleRouter();
