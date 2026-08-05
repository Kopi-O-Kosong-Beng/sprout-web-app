/** Superadmin console routes: accounts, tickets and operations.
 *
 *  Two gates, in order: a valid verified Firebase ID token (authMiddleware),
 *  then the superadmin grant — the Firestore `isSuperAdmin` flag, or the
 *  ADMIN_EMAILS break-glass allowlist (requireSuperAdmin).
 *
 *  The dev/demo bypass headers accepted elsewhere buy nothing here: they yield
 *  a uid with no email, so the allowlist can never match, and the flag lookup
 *  still has to find a profile carrying `isSuperAdmin: true`.
 *
 *  The same gate guards /api/platform, which serves the live API-health probes
 *  and the pipeline studio. Both surfaces answer to one grant, so there is one
 *  place to add or remove an operator.
 */
import { Router } from 'express';
import authMiddleware from '../middleware/auth.middleware';
import requireSuperAdmin from '../middleware/admin.middleware';
import {
  handleAdminAlmanac,
  handleAdminCleanup,
  handleDeleteAccount,
  handleListAccounts,
  handleListTickets,
  handleSetSuperAdmin,
  handleSetTicketStatus,
} from '../controllers/admin.controller';

const router = Router();

router.use(authMiddleware, requireSuperAdmin);
router.get('/users', handleListAccounts);
router.patch('/users/:uid/superadmin', handleSetSuperAdmin);
router.delete('/users/:uid', handleDeleteAccount);
router.get('/almanac', handleAdminAlmanac);
router.post('/cleanup', handleAdminCleanup);
router.get('/tickets', handleListTickets);
router.patch('/tickets/:id/status', handleSetTicketStatus);

export default router;
