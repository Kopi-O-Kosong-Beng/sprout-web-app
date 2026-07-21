/** Avatar archive controller — Req 5, tasks.md 5.1/5.2 */
import type { RequestHandler } from 'express';
import avatarRepository from '../repositories/avatars';

const DEFAULT_PAGE_SIZE = 20;

export const handleListAvatars: RequestHandler = async (req, res, next) => {
  try {
    const userId = req.user!.uid;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number(req.query.pageSize) || DEFAULT_PAGE_SIZE)
    );
    const result = await avatarRepository.listByUser(userId, page, pageSize);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const handleGetAvatar: RequestHandler = async (req, res, next) => {
  try {
    const userId = req.user!.uid;
    const avatar = await avatarRepository.getOwned(userId, req.params.avatarId);
    if (!avatar) {
      res.status(404).json({ error: 'Avatar not found.' });
      return;
    }
    res.status(200).json(avatar);
  } catch (err) {
    next(err);
  }
};

export const handleEnableDemoAvatars: RequestHandler = async (req, res, next) => {
  try {
    const result = await avatarRepository.ensureDemoSet(req.user!.uid);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const handleDisableDemoAvatars: RequestHandler = async (req, res, next) => {
  try {
    const result = await avatarRepository.removeDemoSet(req.user!.uid);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
