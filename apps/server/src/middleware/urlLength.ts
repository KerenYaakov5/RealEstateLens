import type { RequestHandler } from 'express';
import { AppError } from '../errors/AppError.js';

/** Rejects over-long URLs with 414 before any parsing work is done. */
export function limitUrlLength(maxLength: number): RequestHandler {
  return (req, _res, next) => {
    if (req.originalUrl.length > maxLength) {
      next(new AppError(414, 'URI_TOO_LONG', 'כתובת הבקשה ארוכה מדי'));
      return;
    }
    next();
  };
}
