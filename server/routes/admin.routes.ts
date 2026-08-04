/** Admin account-management and operations routes.
 *
 *  Two gates, in order: a valid verified Firebase ID token (authMiddleware),
 *  then membership of the SUPER_ADMIN_EMAILS allowlist (requireSuperAdmin).
 *  Account deletion and the operations dashboard are operator tools, so they
 *  answer to the operator tier — plain ADMIN_EMAILS membership is advisory
 *  (profile badge, UI affordances) and does not open this surface.
 *
 *  The dev bypass CAN reach these routes, and deliberately so — it is how the
 *  local no-password sign-in gets an admin dashboard to work against. It needs
 *  `x-dev-email` naming an address that is itself on SUPER_ADMIN_EMAILS, so it
 *  grants nothing the allowlist has not, and it is inert unless
 *  AUTH_DEV_BYPASS=true and NODE_ENV !== 'production' (see
 *  middleware/auth.middleware.ts). Worth stating plainly rather than leaving
 *  implied: on a machine where the bypass is on, any local process that can
 *  reach the port can drive these endpoints, destructive ones included. That
 *  is the price of the local shortcut, and the reason both guards exist. A
 *  deployed server sets NODE_ENV=production and render.yaml pins
 *  AUTH_DEV_BYPASS=false.
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
