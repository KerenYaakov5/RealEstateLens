import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError } from '../../src/errors/AppError.js';
import { logger } from '../../src/lib/logger.js';
import { errorHandler, isDatabaseUnavailable } from '../../src/middleware/errorHandler.js';

/** An app whose one route fails with `err`. */
function appThrowing(err: unknown) {
  const app = express();
  app.use((req, _res, next) => {
    req.log = logger;
    next();
  });
  app.get('/', () => {
    throw err;
  });
  app.use(errorHandler);
  return app;
}

/** How Drizzle reports a failed query: its own error with the driver's error as the cause. */
function drizzleError(cause: Error): Error {
  return new Error('Failed query: select 1\nparams: ', { cause });
}

function withCode(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

describe('errorHandler', () => {
  it('answers an AppError with its own status, code and Hebrew message', async () => {
    const res = await request(appThrowing(AppError.notFound('העיר לא נמצאה'))).get('/');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'העיר לא נמצאה' });
  });

  it('answers a validation error with 400', async () => {
    const parsed = z.object({ id: z.number() }).safeParse({});
    const res = await request(appThrowing(parsed.error)).get('/');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('answers an unreachable database with 503 and Retry-After, not 500', async () => {
    const res = await request(
      appThrowing(drizzleError(withCode('connect ECONNREFUSED 127.0.0.1:5432', 'ECONNREFUSED'))),
    ).get('/');

    expect(res.status).toBe(503);
    expect(res.headers['retry-after']).toBe('30');
    expect(res.body.error).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      message: 'השירות אינו זמין כרגע. נסו שוב בעוד כמה דקות.',
    });
  });

  it('keeps 500 with a generic Hebrew message for a real bug', async () => {
    const res = await request(appThrowing(new TypeError('x is undefined'))).get('/');

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: 'INTERNAL_ERROR', message: 'אירעה שגיאה בשרת' });
  });
});

describe('isDatabaseUnavailable', () => {
  it.each([
    ['refused connection', drizzleError(withCode('connect ECONNREFUSED', 'ECONNREFUSED'))],
    ['connect timeout', drizzleError(new Error('Connection terminated due to connection timeout'))],
    ['pool timeout', new Error('timeout exceeded when trying to connect')],
    ['too many connections', drizzleError(withCode('sorry, too many clients', '53300'))],
    ['statement timeout', drizzleError(withCode('canceling statement', '57014'))],
  ])('recognizes a %s', (_name, err) => {
    expect(isDatabaseUnavailable(err)).toBe(true);
  });

  it.each([
    ['a unique violation', drizzleError(withCode('duplicate key', '23505'))],
    ['a plain bug', new TypeError('x is undefined')],
    ['a non-error', 'oops'],
  ])('does not treat %s as an outage', (_name, err) => {
    expect(isDatabaseUnavailable(err)).toBe(false);
  });
});
