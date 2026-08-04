/** Admin account-management and operations routes.
 *
 *  Two gates, in order: a valid verified Firebase ID token (authMiddleware),
 *  then membership of the SUPER_ADMIN_EMAILS allowlist (requireSuperAdmin).
 *  Account deletion and the operations dashboard are operator tools, so they
 *  answer to the operator tier — plain ADMIN_EMAILS membership is advisory
 *  (profile badge, UI affordances) and does not open this surface. The dev/demo
 *  bypass headers accepted elsewhere are deliberately NOT usable here —
 *  strictUnverifiedAuthMiddleware is not used, and authMiddleware's bypass only
 *  yields a uid with no email, which can never match the allowlist.
 *
 *  The same allowlist gates /api/platform, which serves the live API-health
 *  probes the dashboard shows. Both surfaces answer to one list, so there is
 *  one place to add or remove an operator.
 */
import { Router } from 'express';
import authMiddleware from '../middleware/auth.middleware';
import { requireSuperAdmin } from '../middleware/admin.middleware';
import {
  handleAdminAlmanac,
  handleAdminCleanup,
  handleDeleteAccount,
  handleListAccounts,
} from '../controllers/admin.controller';

const router = Router();

router.use(authMiddleware, requireSuperAdmin);
router.get('/users', handleListAccounts);
router.delete('/users/:uid', handleDeleteAccount);
router.get('/almanac', handleAdminAlmanac);
router.post('/cleanup', handleAdminCleanup);

export default router;
