/** Leaderboard controller.
 *
 *  Authenticated in full, unlike the almanac list. Every row is a display name
 *  bound to a play record, and the almanac's public view deliberately withholds
 *  finder names from anonymous visitors — publishing the same names as a ranked
 *  table would undo that. See routes/leaderboard.routes.ts.
 */
import type { RequestHandler } from 'express';
import { getLeaderboards } from '../services/leaderboard.service';

export const handleGetLeaderboard: RequestHandler = async (req, res, next) => {
  try {
    // authMiddleware guarantees req.user; the uid decides which row is marked
    // as the caller's and what standing is reported back to them.
    const uid = req.user?.uid;
    if (!uid) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    res.json(await getLeaderboards(uid));
  } catch (err) {
    next(err);
  }
};
