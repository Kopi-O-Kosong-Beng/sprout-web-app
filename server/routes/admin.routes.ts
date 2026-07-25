/** Admin account-management routes.
 *
 *  Two gates, in order: a valid verified Firebase ID token (authMiddleware),
 *  then membership of the ADMIN_EMAILS allowlist (requireAdmin). The dev/demo
 *  bypass headers accepted elsewhere are deliberately NOT usable here —
 *  strictUnverifiedAuthMiddleware is not used, and authMiddleware's bypass only
 *  yields a uid with no email, which can never match the allowlist.
 */
import { Router } from 'express';
import authMiddleware from '../middleware/auth.middleware';
import requireAdmin from '../middleware/admin.middleware';
import {
  handleDeleteAccount,
  handleListAccounts,
} from '../controllers/admin.controller';

const router = Router();

router.use(authMiddleware, requireAdmin);
router.get('/users', handleListAccounts);
router.delete('/users/:uid', handleDeleteAccount);

export default router;
