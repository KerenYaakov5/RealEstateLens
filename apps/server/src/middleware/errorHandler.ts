import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError.js';

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

  req.log.error({ err }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'אירעה שגיאה בשרת' } });
};
