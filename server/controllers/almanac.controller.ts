/** Almanac controller.
 *
 *  The list is public — it is the landing page's centrepiece — and carries no
 *  player identity at all. The per-species detail answers anonymous callers
 *  with the species, its sprite and its stats, and adds the finder's name, the
 *  date and their photograph only for a signed-in caller. See
 *  routes/almanac.routes.ts for where that line is drawn.
 */
import type { RequestHandler } from 'express';
import { getAlmanacEntry, getPublicAlmanac } from '../services/almanac.service';

export const handleGetAlmanac: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await getPublicAlmanac());
  } catch (err) {
    next(err);
  }
};

export const handleGetAlmanacEntry: RequestHandler = async (req, res, next) => {
  try {
    // req.user is set only when the caller presented a usable token; the route
    // uses optional auth, so anonymous callers arrive here too.
    const entry = await getAlmanacEntry(req.params.speciesId, {
      signedIn: Boolean(req.user),
    });
    if (!entry) {
      res.status(404).json({ error: 'Species not found.' });
      return;
    }
    res.json(entry);
  } catch (err) {
    next(err);
  }
};
