/**
 * Almanac routes.
 *
 * GET /api/almanac is deliberately unauthenticated: the landing page shows the
 * grid to visitors who have never signed up, and that is the point of it. What
 * it returns is the published taxonomy plus a per-species found/not-found flag
 * and a tally — no uid, no display name, no photograph. Nothing a player
 * contributed is in that response.
 *
 * GET /api/almanac/:speciesId answers everyone, and answers a signed-in caller
 * with more. Anyone may see the species, the sprite the game made of it and its
 * battle stats — that is the card the landing page opens, and it describes the
 * plant. Only a signed-in caller gets the finder's display name, the discovery
 * date and their own photograph, which describe a person. Hence optional auth
 * rather than two URLs for one card.
 */
import { Router } from 'express';
import { optionalAuthMiddleware } from '../middleware/auth.middleware';
import {
  handleGetAlmanac,
  handleGetAlmanacEntry,
} from '../controllers/almanac.controller';

const router = Router();

router.get('/', handleGetAlmanac);
router.get('/:speciesId', optionalAuthMiddleware, handleGetAlmanacEntry);

export default router;
