/** Admin account-management controller. Every route here sits behind
 *  authMiddleware + requireAdmin (see routes/admin.routes.ts). */
import type { RequestHandler } from 'express';
import {
  AdminOperationError,
  deleteAccount,
  listAccounts,
} from '../services/admin.service';
import { getAdminAlmanac } from '../services/almanac.service';
import { CLEANUP_TARGETS, runCleanup } from '../services/cleanup.service';

export const handleListAccounts: RequestHandler = async (_req, res, next) => {
  try {
    const accounts = await listAccounts();
    res.json({ items: accounts, total: accounts.length });
  } catch (err) {
    next(err);
  }
};

/** The whole taxonomy with discovery detail, plus anything found off-list. */
export const handleAdminAlmanac: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await getAdminAlmanac());
  } catch (err) {
    next(err);
  }
};

/**
 * Firestore cleanup. Dry run unless the caller explicitly asks otherwise, and a
 * destructive run must also re-state the target in `confirmTarget` — a stray
 * `{"dryRun":false}` from a curl session should not empty a collection.
 */
export const handleAdminCleanup: RequestHandler = async (req, res, next) => {
  try {
    const { target, dryRun = true, confirmTarget } = req.body ?? {};
    if (!CLEANUP_TARGETS.includes(target)) {
      res.status(400).json({
        error: `Unknown cleanup target. Expected one of: ${CLEANUP_TARGETS.join(', ')}.`,
      });
      return;
    }
    if (dryRun !== true && confirmTarget !== target) {
      res.status(400).json({
        error: 'Deleting requires confirmTarget to match the target.',
      });
      return;
    }

    const report = await runCleanup(target, { dryRun: dryRun !== false });
    if (!report.dryRun) {
      console.warn(
        `[admin] cleanup ${report.target} deleted=${report.deleted} by=${req.user!.uid}`
      );
    }
    res.json(report);
  } catch (err) {
    next(err);
  }
};

export const handleDeleteAccount: RequestHandler = async (req, res, next) => {
  try {
    const targetUid = req.params.uid;
    if (!targetUid || targetUid.trim().length === 0) {
      res.status(400).json({ error: 'A user id is required.' });
      return;
    }

    const result = await deleteAccount(targetUid, req.user!.uid);
    console.warn(
      `[admin] account deleted uid=${result.id} by=${req.user!.uid} ` +
        `identity=${result.firebaseIdentityDeleted} profile=${result.profileDeleted}`
    );
    res.json(result);
  } catch (err) {
    if (err instanceof AdminOperationError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    next(err);
  }
};
