import type { RequestHandler } from 'express';
import {
  getCurrentUserProfile,
  recordUserLogin,
  recordUserLogout,
  requestPasswordReset,
  signup,
  verifyPasswordReset,
} from '../services/auth.service';

export const handleSignup: RequestHandler = async (req, res, next) => {
  try {
    const result = await signup(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const handleMe: RequestHandler = async (req, res, next) => {
  try {
    const user = req.user!;
    const profile = await getCurrentUserProfile(
      user.uid,
      user.email,
      user.emailVerified
    );
    res.status(200).json(profile);
  } catch (err) {
    next(err);
  }
};

export const handleSessionLogin: RequestHandler = async (req, res, next) => {
  try {
    const user = req.user!;
    const profile = await recordUserLogin(user.uid);
    res.status(200).json(profile);
  } catch (err) {
    next(err);
  }
};

export const handleSessionLogout: RequestHandler = async (req, res, next) => {
  try {
    const user = req.user!;
    const profile = await recordUserLogout(user.uid);
    res.status(200).json(profile);
  } catch (err) {
    next(err);
  }
};

export const handleRequestReset: RequestHandler = async (req, res, next) => {
  try {
    const result = await requestPasswordReset(req.body.email);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const handleVerifyReset: RequestHandler = async (req, res, next) => {
  try {
    const result = await verifyPasswordReset(
      req.body.email,
      req.body.otp,
      req.body.newPassword
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
