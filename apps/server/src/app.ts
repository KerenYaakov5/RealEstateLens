import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import express, { Router, type Express } from 'express';
import { pinoHttp } from 'pino-http';
import { SessionController } from './controllers/session.controller.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiRateLimit, loginRateLimit } from './middleware/rateLimits.js';
import { requireAuth } from './middleware/requireAuth.js';
import { createHealthRouter } from './routes/health.routes.js';
import { createSessionRouter } from './routes/session.routes.js';
import { createUserRouter } from './routes/user.routes.js';
import type { AuthService } from './services/auth.service.js';

export interface AppOptions {
  secureCookies: boolean;
  /** Behind a reverse proxy (Render) the client IP comes from X-Forwarded-For. */
  trustProxy: boolean;
  rateLimitPerMinute: number;
  loginMaxAttempts: number;
  loginWindowMinutes: number;
}

export interface AppDeps {
  auth: AuthService;
  options: AppOptions;
}

export function createApp(deps: AppDeps): Express {
  const app = express();

  app.disable('x-powered-by');
  if (deps.options.trustProxy) {
    app.set('trust proxy', 1);
  }
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const api = Router();

  // Public
  api.use('/health', createHealthRouter());
  api.use(
    '/sessions',
    createSessionRouter(
      new SessionController(deps.auth, { secureCookies: deps.options.secureCookies }),
      loginRateLimit(deps.options.loginMaxAttempts, deps.options.loginWindowMinutes),
    ),
  );

  // Everything below requires a logged-in user
  api.use(requireAuth(deps.auth), apiRateLimit(deps.options.rateLimitPerMinute));
  api.use('/users', createUserRouter());

  app.use('/api/v1', api);
  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
