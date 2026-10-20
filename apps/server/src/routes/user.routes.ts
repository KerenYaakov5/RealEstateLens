import { Router } from 'express';
import { AppError } from '../errors/AppError.js';
import type { CompromiseRecommendationService } from '../services/recommendation/recommendation.service.js';

export function createUserRouter(recommendations: CompromiseRecommendationService): Router {
  const router = Router();

  // GET /users/me – the logged-in user and how many personal recommendations are left today.
  router.get('/me', async (req, res) => {
    if (req.user === undefined) {
      throw AppError.unauthorized();
    }
    res.json({
      email: req.user.email,
      aiQuotaLeft: await recommendations.quotaLeft(req.user.id),
    });
  });

  return router;
}
