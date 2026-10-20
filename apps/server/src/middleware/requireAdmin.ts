import type { RequestHandler } from 'express';
import { AppError } from '../errors/AppError.js';

/** After requireAuth: only administrators (ADMIN_EMAILS) may continue. */
export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.user?.isAdmin !== true) {
    next(AppError.forbidden());
    return;
  }
  next();
};
