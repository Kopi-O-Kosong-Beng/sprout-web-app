import { Router } from 'express';
import rateLimit, { MemoryStore } from 'express-rate-limit';
import Joi from 'joi';
import {
  handleMe,
  handleRequestReset,
  handleResendVerification,
  handleAckDisplayNameNotice,
  handleSessionLogin,
  handleSessionLogout,
  handleSignInMethod,
  handleSignup,
  handleVerifyReset,
} from '../controllers/auth.controller';
import authMiddleware, {
  strictUnverifiedAuthMiddleware,
  unverifiedAuthMiddleware,
} from '../middleware/auth.middleware';
import validate from '../middleware/validation.middleware';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
});

export const verificationResendIpStore = new MemoryStore();
export const verificationResendAccountStore = new MemoryStore();

const verificationResendIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: verificationResendIpStore,
});

const verificationResendAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  store: verificationResendAccountStore,
  keyGenerator: (req) => req.user!.uid,
});

const signupSchema = Joi.object({
  email: Joi.string().trim().email().required(),
  password: Joi.string().required(),
  displayName: Joi.string().trim().min(1).max(50).pattern(/^[A-Za-z0-9 _-]+$/).required(),
});

const requestResetSchema = Joi.object({
  email: Joi.string().trim().email().required(),
});

const verifyResetSchema = Joi.object({
  email: Joi.string().trim().email().required(),
  otp: Joi.string().trim().pattern(/^\d{6}$/).required(),
  newPassword: Joi.string().required(),
});

router.post('/signup', authLimiter, validate(signupSchema), handleSignup);
router.post(
  '/resend-verification',
  verificationResendIpLimiter,
  strictUnverifiedAuthMiddleware,
  verificationResendAccountLimiter,
  handleResendVerification
);
router.post(
  '/sign-in-method',
  authLimiter,
  validate(requestResetSchema),
  handleSignInMethod
);
router.get('/me', authMiddleware, handleMe);
router.post(
  '/display-name-notice/ack',
  unverifiedAuthMiddleware,
  handleAckDisplayNameNotice
);
router.post('/session/login', unverifiedAuthMiddleware, handleSessionLogin);
router.post('/session/logout', unverifiedAuthMiddleware, handleSessionLogout);
router.post(
  '/request-reset',
  authLimiter,
  validate(requestResetSchema),
  handleRequestReset
);
router.post(
  '/verify-reset',
  authLimiter,
  validate(verifyResetSchema),
  handleVerifyReset
);

export default router;
