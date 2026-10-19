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

  req.log.error({ err }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'אירעה שגיאה בשרת' } });
};
