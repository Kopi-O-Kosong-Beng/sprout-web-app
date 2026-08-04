/**
 * Leaderboard routes.
 *
 * `router.use(authMiddleware)` rather than per-handler auth, so a route added
 * here later cannot be published by omission — the same shape pipeline.routes
 * uses.
 *
 * Authenticated on purpose. The almanac grid is public because it carries only
 * taxonomy and a found/not-found tally; these boards are entirely display names
 * attached to play records, which is the half the almanac keeps behind a login.
 */
import { Router } from 'express';
import authMiddleware from '../middleware/auth.middleware';
import { handleGetLeaderboard } from '../controllers/leaderboard.controller';

const router = Router();

router.use(authMiddleware);
router.get('/', handleGetLeaderboard);

export default router;
