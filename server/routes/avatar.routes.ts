/** Avatar archive routes — Req 5, tasks.md 5.3. All protected by auth. */
import { Router } from 'express';
import authMiddleware from '../middleware/auth.middleware';
import {
  handleListAvatars,
  handleGetAvatar,
} from '../controllers/avatar.controller';

const router = Router();

router.use(authMiddleware);
router.get('/', handleListAvatars);
router.get('/:avatarId', handleGetAvatar);

export default router;
