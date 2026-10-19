import type { RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { AppError } from '../errors/AppError.js';
import { normalizeEmail } from '../repositories/user.repository.js';

// Limits are kept in memory. With more than one server instance they would need a shared
// store (Postgres or Redis) – see the plan.

function clientIp(ip: string | undefined): string {
  return ipKeyGenerator(ip ?? 'unknown');
}

/** Failed-login guard: counts attempts per IP + email; successful logins are not counted. */
export function loginRateLimit(maxAttempts: number, windowMinutes: number): RequestHandler {
  return rateLimit({
    windowMs: windowMinutes * 60_000,
    limit: maxAttempts,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => {
      const body: unknown = req.body;
      const email =
        typeof body === 'object' &&
        body !== null &&
        'email' in body &&
        typeof body.email === 'string'
          ? normalizeEmail(body.email)
          : '';
      return `${clientIp(req.ip)}|${email}`;
    },
    handler: (_req, _res, next) => {
      next(AppError.tooManyRequests('יותר מדי ניסיונות התחברות, נסו שוב בעוד כמה דקות'));
    },
  });
}

/** General limit for authenticated API calls, per user (falls back to IP). */
export function apiRateLimit(perMinute: number): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit: perMinute,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => {
      return req.user === undefined ? clientIp(req.ip) : `user:${req.user.id}`;
    },
    handler: (_req, _res, next) => {
      next(AppError.tooManyRequests());
    },
  });
}
