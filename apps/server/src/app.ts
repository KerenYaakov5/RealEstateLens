import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import express, { Router, type Express } from 'express';
import { pinoHttp } from 'pino-http';
import { MAX_URL_LENGTH } from '@rel/shared';
import { AdminController } from './controllers/admin.controller.js';
import { AssessmentController } from './controllers/assessment.controller.js';
import { MarketController } from './controllers/market.controller.js';
import { RecommendationController } from './controllers/recommendation.controller.js';
import { RegistrationController } from './controllers/registration.controller.js';
import { SessionController } from './controllers/session.controller.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiRateLimit, loginRateLimit, registrationRateLimit } from './middleware/rateLimits.js';
import { requireAuth } from './middleware/requireAuth.js';
import { limitUrlLength } from './middleware/urlLength.js';
import { createWebAppRouter } from './middleware/webApp.js';
import { createHealthRouter } from './routes/health.routes.js';
import {
  createAssessmentRouter,
  createCityRouter,
  createDealRouter,
} from './routes/market.routes.js';
import { createRecommendationRouter } from './routes/recommendation.routes.js';
import { createSessionRouter } from './routes/session.routes.js';
import {
  createLogRouter,
  createRegistrationCodeRouter,
  createUserRouter,
} from './routes/user.routes.js';
import type { AppLogRepository } from './repositories/appLog.repository.js';
import type { RegistrationCodeRepository } from './repositories/registrationCode.repository.js';
import type { UserRepository } from './repositories/user.repository.js';
import type { AuthService } from './services/auth.service.js';
import { MarketAssessmentService } from './services/marketAssessment.service.js';
import type { MarketDataService } from './services/marketData.service.js';
import type { RegistrationService } from './services/registration.service.js';
import type { RegistrationCodeVault } from './services/registrationCode.js';
import type { CompromiseRecommendationService } from './services/recommendation/recommendation.service.js';

export interface AppOptions {
  secureCookies: boolean;
  /** Behind a reverse proxy (Render) the client IP comes from X-Forwarded-For. */
  trustProxy: boolean;
  rateLimitPerMinute: number;
  loginMaxAttempts: number;
  loginWindowMinutes: number;
  /** Registration attempts per IP and hour (wrong codes count too). */
  registrationsPerHour: number;
  /** Folder of the built web client; null = API only. */
  webDistPath: string | null;
}

export interface AppDeps {
  auth: AuthService;
  marketData: MarketDataService;
  recommendations: CompromiseRecommendationService;
  registrations: RegistrationService;
  users: UserRepository;
  registrationCodes: RegistrationCodeRepository;
  registrationCodeVault: RegistrationCodeVault;
  appLogs: AppLogRepository;
  options: AppOptions;
}

export function createApp(deps: AppDeps): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Only our own code; the Hebrew font comes from Google Fonts.
          'style-src': ["'self'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
        },
      },
    }),
  );
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
      // Who made the request (set by requireAuth; read when the request completes).
      customProps: (req) => {
        return req.user === undefined ? {} : { userId: req.user.id };
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const api = Router();
  api.use(limitUrlLength(MAX_URL_LENGTH));

  // Public
  api.use('/health', createHealthRouter());
  const sessions = new SessionController(deps.auth, { secureCookies: deps.options.secureCookies });
  api.use(
    '/sessions',
    createSessionRouter(
      sessions,
      loginRateLimit(deps.options.loginMaxAttempts, deps.options.loginWindowMinutes),
    ),
  );
  // Registration with the registration code – public, like login.
  api.post(
    '/users',
    registrationRateLimit(deps.options.registrationsPerHour),
    new RegistrationController(deps.registrations, sessions).create,
  );

  // Everything below requires a logged-in user
  api.use(requireAuth(deps.auth), apiRateLimit(deps.options.rateLimitPerMinute));
  const admin = new AdminController(
    deps.registrationCodes,
    deps.registrationCodeVault,
    deps.users,
    deps.auth,
    deps.appLogs,
  );
  api.use('/users', createUserRouter(deps.recommendations, admin));
  api.use('/registration-code', createRegistrationCodeRouter(admin));
  api.use('/logs', createLogRouter(admin));
  const market = new MarketController(deps.marketData);
  api.use('/cities', createCityRouter(market));
  api.use('/deals', createDealRouter(market));
  // One instance, so recommendations reuse the assessments' result cache.
  const assessments = new MarketAssessmentService();
  api.use(
    '/market-assessments',
    createAssessmentRouter(new AssessmentController(deps.marketData, assessments)),
  );
  api.use(
    '/compromise-recommendations',
    createRecommendationRouter(
      new RecommendationController(deps.marketData, assessments, deps.recommendations),
    ),
  );

  app.use('/api/v1', api);
  app.use('/api', notFoundHandler);

  const webApp =
    deps.options.webDistPath === null ? null : createWebAppRouter(deps.options.webDistPath);
  if (webApp !== null) {
    app.use(webApp);
  }
  app.use(errorHandler);

  return app;
}
