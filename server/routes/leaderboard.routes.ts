/**
 * Leaderboard routes.
 *
 * `router.use(...)` rather than per-handler auth, so a route added here later
 * cannot be published by omission — the same shape pipeline.routes uses.
 *
 * Readable without a session, because Ranking is one of the three tabs a
 * signed-out visitor is meant to be able to open. That is a deliberate
 * loosening of the earlier position, which kept these boards behind a login on
 * the grounds that they are display names bound to play records while the
 * public almanac withholds finder names.
 *
 * What anonymity still costs the caller: the `caller` standing comes back empty
 * and no row is flagged `isCaller`, so the personal half — where *you* rank —
 * remains something only a signed-in player sees. The public half is the
 * top-ten table, which is what a leaderboard is for.
 *
 * To close it again, swap optionalAuthMiddleware back to authMiddleware here;
 * the controller already answers 401 when no uid is attached.
 */
import { Router } from 'express';
import { optionalAuthMiddleware } from '../middleware/auth.middleware';
import { handleGetLeaderboard } from '../controllers/leaderboard.controller';

const router = Router();

router.use(optionalAuthMiddleware);
router.get('/', handleGetLeaderboard);

export default router;
