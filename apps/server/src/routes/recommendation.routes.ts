import { Router } from 'express';
import type { RecommendationController } from '../controllers/recommendation.controller.js';

export function createRecommendationRouter(controller: RecommendationController): Router {
  const router = Router();
  router.post('/', controller.create);
  return router;
}
