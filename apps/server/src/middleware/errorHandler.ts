import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError.js';

const CLIENT_ERROR_CODES: Readonly<Record<number, string>> = {
  400: 'BAD_REQUEST',
  404: 'NOT_FOUND',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
};

const CLIENT_ERROR_MESSAGES: Readonly<Record<number, string>> = {
  400: 'הבקשה אינה תקינה',
  404: 'המשאב המבוקש לא נמצא',
  413: 'הבקשה גדולה מדי',
  415: 'סוג התוכן אינו נתמך',
};

/** The 4xx status of an http-errors style error (as thrown by body-parser / serve-static). */
function clientErrorStatus(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) {
    return null;
  }
  const { status, statusCode } = err as { status?: unknown; statusCode?: unknown };
  const value = status ?? statusCode;
  return typeof value === 'number' && value >= 400 && value < 500 ? value : null;
}

/** Network errors and Postgres codes that mean "the database can't be reached right now". */
const DATABASE_UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  // Postgres: connection exceptions (08xxx), too many connections, shutting down, query timeout.
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  '53300',
  '57P01',
  '57P03',
  '57014',
]);
const DATABASE_UNAVAILABLE_MESSAGE =
  /timeout exceeded when trying to connect|Connection terminated|Client has encountered a connection error/;

/** Walks the `cause` chain (Drizzle wraps the driver's error) for a connection failure. */
export function isDatabaseUnavailable(err: unknown): boolean {
  for (let current = err, depth = 0; current instanceof Error && depth < 5; depth++) {
    const { code } = current as { code?: unknown };
    if (typeof code === 'string' && DATABASE_UNAVAILABLE_CODES.has(code)) {
      return true;
    }
    if (DATABASE_UNAVAILABLE_MESSAGE.test(current.message)) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(AppError.notFound('הנתיב המבוקש לא קיים'));
};

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  if (err instanceof AppError) {
    if (err.status >= 500) {
      req.log.error({ err }, 'Application error');
    } else {
      req.log.warn({ code: err.code, status: err.status }, err.message);
    }
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    req.log.warn({ issues: err.issues }, 'Validation failed');
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'הנתונים שנשלחו אינם תקינים',
        details: err.issues,
      },
    });
    return;
  }

  // Errors raised by Express middleware (malformed JSON body, oversized body, missing static
  // file) carry their own 4xx status – they are the client's mistake, not a server failure.
  const clientStatus = clientErrorStatus(err);
  if (clientStatus !== null) {
    req.log.warn({ status: clientStatus, err: (err as Error).message }, 'Client error');
    res.status(clientStatus).json({
      error: {
        code: CLIENT_ERROR_CODES[clientStatus] ?? 'BAD_REQUEST',
        message: CLIENT_ERROR_MESSAGES[clientStatus] ?? 'הבקשה אינה תקינה',
      },
    });
    return;
  }

  // Temporary, not a bug in the request: 503 tells the client (and its retry) to try again.
  if (isDatabaseUnavailable(err)) {
    req.log.error({ err }, 'Database unavailable');
    res.set('Retry-After', '30');
    res.status(503).json({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'השירות אינו זמין כרגע. נסו שוב בעוד כמה דקות.',
      },
    });
    return;
  }

  req.log.error({ err }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'אירעה שגיאה בשרת' } });
};
