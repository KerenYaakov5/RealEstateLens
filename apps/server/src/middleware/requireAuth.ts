import type { RequestHandler } from 'express';
import { AppError } from '../errors/AppError.js';
import type { AuthService } from '../services/auth.service.js';

export const SESSION_COOKIE = 'rel_session';

/** Rejects the request with 401 unless it carries a valid session cookie. */
export function requireAuth(auth: AuthService): RequestHandler {
  return (req, _res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token.length === 0) {
      next(AppError.unauthorized());
      return;
    }
    auth
      .verifyToken(token)
      .then((user) => {
        if (user === null) {
          next(AppError.unauthorized('פג תוקף ההתחברות, יש להתחבר מחדש'));
          return;
        }
        req.user = user;
        next();
      })
      .catch(next);
  };
}
