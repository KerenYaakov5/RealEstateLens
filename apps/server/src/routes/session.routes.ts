import { Router, type RequestHandler } from 'express';
import type { SessionController } from '../controllers/session.controller.js';

export function createSessionRouter(
  controller: SessionController,
  loginLimiter: RequestHandler,
): Router {
  const router = Router();
  router.post('/', loginLimiter, controller.create);
  router.delete('/current', controller.destroy);
  return router;
}
