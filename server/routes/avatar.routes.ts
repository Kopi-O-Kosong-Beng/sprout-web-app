/** Avatar archive routes — Req 5, tasks.md 5.3. All protected by auth. */
import { Router } from 'express';
import type { RequestHandler } from 'express';
import authMiddleware from '../middleware/auth.middleware';
import {
  handleDisableDemoAvatars,
  handleEnableDemoAvatars,
  handleListAvatars,
  handleGetAvatar,
} from '../controllers/avatar.controller';

const router = Router();

const requireDemoTools: RequestHandler = (_req, res, next) => {
  if (process.env.ENABLE_DEMO_TOOLS !== 'true') {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  next();
};

router.post('/demo', requireDemoTools, authMiddleware, handleEnableDemoAvatars);
router.delete('/demo', requireDemoTools, authMiddleware, handleDisableDemoAvatars);
router.use(authMiddleware);
router.get('/', handleListAvatars);
router.get('/:avatarId', handleGetAvatar);

export default router;
