/** Operations portal routes for the AI sprite pipeline.
 *
 *  Migrated from Sprout_Dev_Platform, where they were mounted at /api/admin.
 *  That prefix is already taken here by the account-management endpoints, so the
 *  portal moves to /api/platform — the two are unrelated surfaces that happened
 *  to share a name.
 *
 *  Both gates apply, in order: a valid verified Firebase ID token, then
 *  membership of the ADMIN_EMAILS allowlist. The platform had no auth at all,
 *  which was defensible when it ran on a developer's laptop behind a Vite dev
 *  server and indefensible now that it is deployed: /config-status enumerates
 *  which provider keys exist, and /run-tests spawns a process.
 */
import { Router } from 'express';
import authMiddleware from '../middleware/auth.middleware';
import requireAdmin from '../middleware/admin.middleware';
import { adminRouter as platformPortalRouter } from '../platform/adminRoutes';

const router = Router();

router.use(authMiddleware, requireAdmin);
router.use(platformPortalRouter);

export default router;
