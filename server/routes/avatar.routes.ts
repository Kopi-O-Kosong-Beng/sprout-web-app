/** Avatar archive routes — Req 5, tasks.md 5.3. All protected by auth. */
import { Router, json } from 'express';
import type { RequestHandler } from 'express';
import Joi from 'joi';
import rateLimit from 'express-rate-limit';
import { CAPTURE_SOURCES } from '../data/capture-source';
import authMiddleware from '../middleware/auth.middleware';
import validate from '../middleware/validation.middleware';
import {
  handleCreateAvatar,
  handleDeleteAvatar,
  handleDisableDemoAvatars,
  handleEnableDemoAvatars,
  handleListAvatars,
  handleGetAvatar,
} from '../controllers/avatar.controller';

const router = Router();

/**
 * Saving a scan carries the finished sprite in the body, so this router parses
 * its own JSON at a higher ceiling than the app-wide default (100 kB). app.ts
 * skips its global parser for this prefix — otherwise the body would be
 * consumed there first and answered 413 before this limit was ever consulted,
 * which is the trap the pipeline router documents.
 *
 * 1 MB is Firestore's document ceiling; the schema below rejects sprites well
 * before that, so this limit only guards against a body that is not a sprite.
 */
router.use(json({ limit: '1mb' }));

const requireDemoTools: RequestHandler = (_req, res, next) => {
  if (process.env.ENABLE_DEMO_TOOLS !== 'true') {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  next();
};

/**
 * A finished sprite is a 192x192 Spica72 PNG — a few tens of kB of base64.
 * 512 kB leaves generous room for a noisier render while keeping the document
 * (sprite plus metadata) inside Firestore's 1 MB limit, which a write past it
 * would fail on with a far less helpful message.
 */
const MAX_SPRITE_DATA_URL_CHARS = 512_000;

/**
 * The original photograph, kept beside the sprite so the archive can show what
 * the plant really looked like. The client sends a downscaled JPEG — a few tens
 * of kB — and this ceiling plus the sprite's stays inside Firestore's 1 MB
 * document limit even at both extremes.
 */
const MAX_PHOTO_DATA_URL_CHARS = 300_000;

const createAvatarSchema = Joi.object({
  speciesName: Joi.string().trim().min(1).max(120).required(),
  speciesFamily: Joi.string().trim().max(120).allow('', null).optional(),
  spriteDataUrl: Joi.string()
    .pattern(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/)
    .max(MAX_SPRITE_DATA_URL_CHARS)
    .required()
    .messages({
      'string.pattern.base': 'spriteDataUrl must be a base64 PNG data URL.',
      'string.max': 'Sprite is too large to save. Re-run the scan and try again.',
    }),
  photoDataUrl: Joi.string()
    .pattern(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/)
    .max(MAX_PHOTO_DATA_URL_CHARS)
    .optional()
    .messages({
      'string.pattern.base': 'photoDataUrl must be a base64 JPEG data URL.',
      'string.max': 'Photo is too large to save. Re-run the scan and try again.',
    }),
  /**
   * How the plant was captured, which decides how long it lives:
   * 'mobile' is an IRL camera scan and is kept, 'web' is a file upload and
   * expires in 24 hours (Req 6.12). Required — defaulting it would let a
   * mislabelled client quietly grant permanence to an upload.
   */
  source: Joi.string()
    .valid(...CAPTURE_SOURCES)
    .required(),
  // Everything the scan learned about the plant, and nothing else: stripUnknown
  // drops the rest, so a caller cannot grow the stored document at will.
  metadata: Joi.object({
    taxonomy: Joi.object().pattern(Joi.string(), Joi.string().max(120)).optional(),
    commonNames: Joi.array().items(Joi.string().trim().max(120)).max(10).optional(),
    description: Joi.string().trim().max(600).allow('').optional(),
    confidence: Joi.number().min(0).max(1).optional(),
    habitat: Joi.string().trim().max(200).allow('').optional(),
    conservationStatus: Joi.string().trim().max(120).allow('').optional(),
  }).default({}),
});

/** Req 6.14's spirit: a scan is expensive upstream, so cap how many finished
 *  ones one account can bank per hour. Keyed on the authenticated uid, so it
 *  cannot be sidestepped by rotating IPs. */
const createAvatarLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid ?? 'anonymous',
  message: { error: 'Too many saved scans. Try again in an hour.' },
});

router.post('/demo', requireDemoTools, authMiddleware, handleEnableDemoAvatars);
router.delete('/demo', requireDemoTools, authMiddleware, handleDisableDemoAvatars);
router.use(authMiddleware);
router.get('/', handleListAvatars);
router.post(
  '/',
  createAvatarLimiter,
  validate(createAvatarSchema),
  handleCreateAvatar
);
router.get('/:avatarId', handleGetAvatar);
router.delete('/:avatarId', handleDeleteAvatar);

export default router;
