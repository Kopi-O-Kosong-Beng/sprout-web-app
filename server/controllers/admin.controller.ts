/** Admin account-management controller. Every route here sits behind
 *  authMiddleware + requireAdmin (see routes/admin.routes.ts). */
import type { RequestHandler } from 'express';
import {
  AdminOperationError,
  deleteAccount,
  listAccounts,
} from '../services/admin.service';

export const handleListAccounts: RequestHandler = async (_req, res, next) => {
  try {
    const accounts = await listAccounts();
    res.json({ items: accounts, total: accounts.length });
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
