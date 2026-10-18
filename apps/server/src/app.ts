import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createHealthRouter } from './routes/health.routes.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
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

  app.use('/api/v1/health', createHealthRouter());

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
