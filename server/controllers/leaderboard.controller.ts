/** Leaderboard controller.
 *
 *  Open to anonymous callers, like the almanac list — see the reasoning in
 *  routes/leaderboard.routes.ts.
 */
import type { RequestHandler } from 'express';
import { getLeaderboards } from '../services/leaderboard.service';

export const handleGetLeaderboard: RequestHandler = async (req, res, next) => {
  try {
    // The uid decides which row is marked as the caller's and what standing is
    // reported back. An empty string matches no player, which is exactly the
    // anonymous answer: every row `isCaller: false`, and a caller standing of
    // rank null. No branch needed, and no way to accidentally attribute a row.
    res.json(await getLeaderboards(req.user?.uid ?? ''));
  } catch (err) {
    next(err);
  }
};
